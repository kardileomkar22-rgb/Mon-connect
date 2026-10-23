// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/**
 * @title ChainConnectV2
 * @notice Organizer <-> Vendor registry and escrow for MonConnect (Monad).
 *
 * The public ABI (function names, argument order, struct field order and events)
 * is intentionally identical to the ABI the frontend already ships with, so the
 * React code needs no changes other than the new contract address.
 *
 * Escrow lifecycle:
 *   createEscrow*  -> Funded
 *   startJob       -> InProgress   (vendor, with proof URL)
 *   completeJob    -> Completed    (vendor)
 *   releasePayment -> Released     (organizer)  pays vendor, mints Job NFT
 *   refundEscrow   -> Refunded     (organizer)  only before work starts, or after
 *                                               the deadline if work is not completed
 * `Created` exists in the enum for ABI compatibility; escrows are funded at creation.
 *
 * Fees (basis points, 10_000 = 100%):
 *   - Organizer fee 1%: paid on top of jobAmount at creation, sent to feeWallet immediately.
 *   - Vendor fee 1% of jobAmount: deducted from the vendor's payout at release.
 *   - Advance 15%: organizer may release it early to the vendor (fee-free; vendor fee is settled at release).
 *   - Penalty: if the job was completed after the deadline, penaltyRate % of jobAmount
 *     (capped by the remaining balance) goes back to the organizer at release.
 */
contract ChainConnectV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- types
    enum JobStatus {
        Created,
        Funded,
        InProgress,
        Completed,
        Released,
        Refunded
    }

    struct OrganizerProfile {
        address walletAddress;
        string name;
        string email;
        string phone;
        bool isActive;
        uint256 registeredAt;
    }

    struct VendorProfile {
        address walletAddress;
        string businessName;
        string businessType;
        string ownerName;
        string email;
        string phone;
        string gstNumber;
        bool isActive;
        uint256 registeredAt;
        uint256 completedJobs;
        uint256 level;
    }

    struct Escrow {
        uint256 id;
        address organizer;
        address vendor;
        uint256 originalAmount;
        uint256 escrowBalance;
        address tokenAddress; // address(0) = native MON
        uint256 deadline;
        uint256 penaltyRate; // whole percent, 0..MAX_PENALTY_RATE
        uint256 completedAt;
        JobStatus status;
        string proofUrl;
        bool advanceApproved;
    }

    struct JobNFT {
        address vendor;
        uint256 jobId;
        uint256 timestamp;
        uint256 level;
    }

    // ------------------------------------------------------------ constants
    uint256 public constant ORGANIZER_FEE_RATE = 100; // 1%
    uint256 public constant VENDOR_FEE_RATE = 100; // 1%
    uint256 public constant ADVANCE_PAYMENT_RATE = 1500; // 15%
    uint256 public constant MAX_PENALTY_RATE = 50; // 50 (percent)
    uint256 private constant BPS = 10_000;
    uint256 private constant MAX_FIELD_LEN = 256;

    // -------------------------------------------------------------- storage
    address public platformFeeWallet;

    mapping(address => OrganizerProfile) public organizerProfiles;
    address[] public organizerAddresses;

    mapping(address => VendorProfile) public vendorProfiles;
    address[] public vendorAddresses;

    mapping(uint256 => Escrow) public escrows;
    uint256 private _escrowCount;

    mapping(uint256 => JobNFT) public jobNFTs;
    uint256 private _jobNftCount;

    // --------------------------------------------------------------- events
    event OrganizerRegistered(address indexed organizer, string name);
    event OrganizerProfileUpdated(address indexed organizer);
    event OrganizerStatusChanged(address indexed organizer, bool isActive);
    event VendorRegistered(address indexed vendor, string businessName);
    event VendorProfileUpdated(address indexed vendor);
    event VendorStatusChanged(address indexed vendor, bool isActive);
    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed organizer,
        address indexed vendor,
        uint256 amount,
        address tokenAddress
    );
    event JobStatusUpdated(uint256 indexed escrowId, JobStatus status);
    event AdvancePaymentApproved(uint256 indexed escrowId, uint256 amount);
    event PaymentReleased(uint256 indexed escrowId, address indexed vendor, uint256 finalAmount);
    event PenaltyPaid(uint256 indexed escrowId, address indexed organizer, uint256 amount);
    event PlatformFeePaid(uint256 indexed escrowId, address indexed wallet, uint256 amount, address payer);
    event RefundIssued(uint256 indexed escrowId, address indexed organizer, uint256 amount);
    event JobNFTMinted(address indexed vendor, uint256 indexed tokenId, uint256 level);

    // ---------------------------------------------------------- constructor
    constructor(address _feeWallet) {
        require(_feeWallet != address(0), "Invalid fee wallet");
        platformFeeWallet = _feeWallet;
    }

    // ------------------------------------------------------------ modifiers
    modifier validEscrow(uint256 _escrowId) {
        require(_escrowId < _escrowCount, "Escrow does not exist");
        _;
    }

    // ============================================================ ORGANIZERS

    /// @notice Register the caller as an organizer (or update the profile if already registered).
    function registerOrganizer(string calldata _name, string calldata _email, string calldata _phone) external {
        _checkLen(_name, true);
        _checkLen(_email, false);
        _checkLen(_phone, false);

        OrganizerProfile storage p = organizerProfiles[msg.sender];
        if (p.registeredAt == 0) {
            p.walletAddress = msg.sender;
            p.name = _name;
            p.email = _email;
            p.phone = _phone;
            p.isActive = true;
            p.registeredAt = block.timestamp;
            organizerAddresses.push(msg.sender);
            emit OrganizerRegistered(msg.sender, _name);
        } else {
            p.name = _name;
            p.email = _email;
            p.phone = _phone;
            emit OrganizerProfileUpdated(msg.sender);
        }
    }

    function updateOrganizerProfile(string calldata _name, string calldata _email, string calldata _phone) external {
        OrganizerProfile storage p = organizerProfiles[msg.sender];
        require(p.registeredAt != 0, "Organizer not registered");
        _checkLen(_name, true);
        _checkLen(_email, false);
        _checkLen(_phone, false);
        p.name = _name;
        p.email = _email;
        p.phone = _phone;
        emit OrganizerProfileUpdated(msg.sender);
    }

    function setOrganizerStatus(bool _isActive) external {
        OrganizerProfile storage p = organizerProfiles[msg.sender];
        require(p.registeredAt != 0, "Organizer not registered");
        p.isActive = _isActive;
        emit OrganizerStatusChanged(msg.sender, _isActive);
    }

    function getOrganizerProfile(address _organizer) external view returns (OrganizerProfile memory) {
        return organizerProfiles[_organizer];
    }

    function getTotalOrganizers() external view returns (uint256) {
        return organizerAddresses.length;
    }

    // ============================================================== VENDORS

    /// @notice Register the caller as a vendor (or update the profile if already registered).
    function registerVendor(
        string calldata _businessName,
        string calldata _businessType,
        string calldata _ownerName,
        string calldata _email,
        string calldata _phone,
        string calldata _gstNumber
    ) external {
        _checkVendorFields(_businessName, _businessType, _ownerName, _email, _phone, _gstNumber);

        VendorProfile storage v = vendorProfiles[msg.sender];
        if (v.registeredAt == 0) {
            v.walletAddress = msg.sender;
            v.isActive = true;
            v.registeredAt = block.timestamp;
            v.level = 1;
            vendorAddresses.push(msg.sender);
            _setVendorFields(v, _businessName, _businessType, _ownerName, _email, _phone, _gstNumber);
            emit VendorRegistered(msg.sender, _businessName);
        } else {
            _setVendorFields(v, _businessName, _businessType, _ownerName, _email, _phone, _gstNumber);
            emit VendorProfileUpdated(msg.sender);
        }
    }

    function updateVendorProfile(
        string calldata _businessName,
        string calldata _businessType,
        string calldata _ownerName,
        string calldata _email,
        string calldata _phone,
        string calldata _gstNumber
    ) external {
        VendorProfile storage v = vendorProfiles[msg.sender];
        require(v.registeredAt != 0, "Vendor not registered");
        _checkVendorFields(_businessName, _businessType, _ownerName, _email, _phone, _gstNumber);
        _setVendorFields(v, _businessName, _businessType, _ownerName, _email, _phone, _gstNumber);
        emit VendorProfileUpdated(msg.sender);
    }

    function setVendorStatus(bool _isActive) external {
        VendorProfile storage v = vendorProfiles[msg.sender];
        require(v.registeredAt != 0, "Vendor not registered");
        v.isActive = _isActive;
        emit VendorStatusChanged(msg.sender, _isActive);
    }

    function getVendorProfile(address _vendor) external view returns (VendorProfile memory) {
        return vendorProfiles[_vendor];
    }

    /// @notice All vendors currently marked active (used by the organizer "browse vendors" screen).
    function getActiveVendors() external view returns (VendorProfile[] memory) {
        uint256 n = vendorAddresses.length;
        uint256 count;
        for (uint256 i = 0; i < n; i++) {
            if (vendorProfiles[vendorAddresses[i]].isActive) count++;
        }
        VendorProfile[] memory out = new VendorProfile[](count);
        uint256 j;
        for (uint256 i = 0; i < n; i++) {
            VendorProfile storage v = vendorProfiles[vendorAddresses[i]];
            if (v.isActive) out[j++] = v;
        }
        return out;
    }

    function getTotalVendors() external view returns (uint256) {
        return vendorAddresses.length;
    }

    // ============================================================== ESCROW

    /**
     * @notice Create and fund an escrow with native MON.
     * @param _vendor      registered, active vendor wallet
     * @param _jobAmount   amount the vendor is owed (wei)
     * @param _deadline    unix timestamp, must be in the future
     * @param _penaltyRate late penalty in whole percent (0..50)
     * @dev msg.value must equal _jobAmount + 1% organizer fee exactly.
     */
    function createEscrowNative(
        address _vendor,
        uint256 _jobAmount,
        uint256 _deadline,
        uint256 _penaltyRate
    ) external payable nonReentrant returns (uint256) {
        uint256 fee = _validateNewEscrow(_vendor, _jobAmount, _deadline, _penaltyRate);
        require(msg.value == _jobAmount + fee, "Incorrect payment amount");

        uint256 id = _storeEscrow(_vendor, _jobAmount, address(0), _deadline, _penaltyRate);

        // Interaction last.
        _sendNative(platformFeeWallet, fee);
        emit PlatformFeePaid(id, platformFeeWallet, fee, msg.sender);
        return id;
    }

    /**
     * @notice Create and fund an escrow with an ERC-20 token (requires prior approval of jobAmount + fee).
     * @dev Fee-on-transfer / rebasing tokens are rejected.
     */
    function createEscrowToken(
        address _vendor,
        uint256 _jobAmount,
        address _tokenAddress,
        uint256 _deadline,
        uint256 _penaltyRate
    ) external nonReentrant returns (uint256) {
        require(_tokenAddress != address(0), "Invalid token address");
        uint256 fee = _validateNewEscrow(_vendor, _jobAmount, _deadline, _penaltyRate);

        uint256 id = _storeEscrow(_vendor, _jobAmount, _tokenAddress, _deadline, _penaltyRate);

        IERC20 token = IERC20(_tokenAddress);
        uint256 beforeBal = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), _jobAmount + fee);
        require(token.balanceOf(address(this)) - beforeBal == _jobAmount + fee, "Unsupported token");

        if (fee > 0) token.safeTransfer(platformFeeWallet, fee);
        emit PlatformFeePaid(id, platformFeeWallet, fee, msg.sender);
        return id;
    }

    /// @notice Organizer releases the 15% advance to the vendor. Once per escrow.
    function approveAdvancePayment(uint256 _escrowId) external nonReentrant validEscrow(_escrowId) {
        Escrow storage e = escrows[_escrowId];
        require(msg.sender == e.organizer, "Only organizer");
        require(e.status == JobStatus.Funded || e.status == JobStatus.InProgress, "Invalid status");
        require(!e.advanceApproved, "Advance already approved");

        uint256 amount = (e.originalAmount * ADVANCE_PAYMENT_RATE) / BPS;
        // Effects
        e.advanceApproved = true;
        e.escrowBalance -= amount;
        emit AdvancePaymentApproved(_escrowId, amount);
        // Interaction
        _payout(e.tokenAddress, e.vendor, amount);
    }

    /// @notice Vendor starts the job and records a proof/reference URL (e.g. IPFS link).
    function startJob(uint256 _escrowId, string calldata _proofUrl) external validEscrow(_escrowId) {
        Escrow storage e = escrows[_escrowId];
        require(msg.sender == e.vendor, "Only vendor");
        require(e.status == JobStatus.Funded, "Invalid status");
        require(bytes(_proofUrl).length > 0 && bytes(_proofUrl).length <= 512, "Invalid proof URL");

        e.status = JobStatus.InProgress;
        e.proofUrl = _proofUrl;
        emit JobStatusUpdated(_escrowId, JobStatus.InProgress);
    }

    /// @notice Vendor marks the job completed. The organizer then confirms by releasing payment.
    function completeJob(uint256 _escrowId) external validEscrow(_escrowId) {
        Escrow storage e = escrows[_escrowId];
        require(msg.sender == e.vendor, "Only vendor");
        require(e.status == JobStatus.InProgress, "Invalid status");

        e.status = JobStatus.Completed;
        e.completedAt = block.timestamp;
        emit JobStatusUpdated(_escrowId, JobStatus.Completed);
    }

    /**
     * @notice Organizer confirms completion: pays the vendor, applies late penalty and vendor fee,
     *         updates vendor stats and mints a Job NFT record.
     */
    function releasePayment(uint256 _escrowId) external nonReentrant validEscrow(_escrowId) {
        Escrow storage e = escrows[_escrowId];
        require(msg.sender == e.organizer, "Only organizer");
        require(e.status == JobStatus.Completed, "Invalid status");

        (uint256 vendorAmount, uint256 penalty, uint256 vendorFee) = _settlement(e);

        // Effects (all state is final before any external call)
        e.escrowBalance = 0;
        e.status = JobStatus.Released;
        _recordCompletion(e.vendor, _escrowId);

        emit JobStatusUpdated(_escrowId, JobStatus.Released);
        emit PaymentReleased(_escrowId, e.vendor, vendorAmount);
        if (penalty > 0) emit PenaltyPaid(_escrowId, e.organizer, penalty);
        if (vendorFee > 0) emit PlatformFeePaid(_escrowId, platformFeeWallet, vendorFee, e.vendor);

        // Interactions
        _payout(e.tokenAddress, e.vendor, vendorAmount);
        _payout(e.tokenAddress, e.organizer, penalty);
        _payout(e.tokenAddress, platformFeeWallet, vendorFee);
    }

    /**
     * @notice Organizer cancels and recovers the held balance.
     * Allowed when Funded (work not started), or InProgress after the deadline
     * (vendor missed it). Not allowed once the vendor marked the job Completed.
     * The 1% organizer fee already paid to the platform is not refunded.
     */
    function refundEscrow(uint256 _escrowId) external nonReentrant validEscrow(_escrowId) {
        Escrow storage e = escrows[_escrowId];
        require(msg.sender == e.organizer, "Only organizer");
        require(
            e.status == JobStatus.Funded || (e.status == JobStatus.InProgress && block.timestamp > e.deadline),
            "Refund not allowed"
        );

        uint256 amount = e.escrowBalance;
        e.escrowBalance = 0;
        e.status = JobStatus.Refunded;

        emit JobStatusUpdated(_escrowId, JobStatus.Refunded);
        emit RefundIssued(_escrowId, msg.sender, amount);

        _payout(e.tokenAddress, msg.sender, amount);
    }

    function getEscrow(uint256 _escrowId) external view validEscrow(_escrowId) returns (Escrow memory) {
        return escrows[_escrowId];
    }

    function getTotalEscrows() external view returns (uint256) {
        return _escrowCount;
    }

    // ============================================================ JOB NFTs

    function getJobNFT(uint256 _tokenId) external view returns (JobNFT memory) {
        require(_tokenId < _jobNftCount, "NFT does not exist");
        return jobNFTs[_tokenId];
    }

    /// @notice Fully on-chain JSON metadata for a Job NFT record.
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(tokenId < _jobNftCount, "NFT does not exist");
        JobNFT storage n = jobNFTs[tokenId];
        bytes memory json = abi.encodePacked(
            '{"name":"MonConnect Job #',
            Strings.toString(tokenId),
            '","description":"Completed job record","attributes":[',
            '{"trait_type":"Vendor","value":"',
            Strings.toHexString(n.vendor),
            '"},{"trait_type":"Escrow ID","value":',
            Strings.toString(n.jobId),
            '},{"trait_type":"Level","value":',
            Strings.toString(n.level),
            '},{"trait_type":"Timestamp","value":',
            Strings.toString(n.timestamp),
            "}]}"
        );
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(json)));
    }

    // ============================================================ internals

    function _validateNewEscrow(
        address _vendor,
        uint256 _jobAmount,
        uint256 _deadline,
        uint256 _penaltyRate
    ) private view returns (uint256 fee) {
        require(_vendor != address(0), "Invalid vendor");
        require(_vendor != msg.sender, "Organizer cannot be vendor");
        VendorProfile storage v = vendorProfiles[_vendor];
        require(v.registeredAt != 0, "Vendor not registered");
        require(v.isActive, "Vendor not active");
        require(_jobAmount > 0, "Amount must be > 0");
        require(_deadline > block.timestamp, "Deadline must be in the future");
        require(_penaltyRate <= MAX_PENALTY_RATE, "Penalty rate too high");
        fee = (_jobAmount * ORGANIZER_FEE_RATE) / BPS;
    }

    function _storeEscrow(
        address _vendor,
        uint256 _jobAmount,
        address _token,
        uint256 _deadline,
        uint256 _penaltyRate
    ) private returns (uint256 id) {
        id = _escrowCount++;
        escrows[id] = Escrow({
            id: id,
            organizer: msg.sender,
            vendor: _vendor,
            originalAmount: _jobAmount,
            escrowBalance: _jobAmount,
            tokenAddress: _token,
            deadline: _deadline,
            penaltyRate: _penaltyRate,
            completedAt: 0,
            status: JobStatus.Funded,
            proofUrl: "",
            advanceApproved: false
        });
        emit EscrowCreated(id, msg.sender, _vendor, _jobAmount, _token);
        emit JobStatusUpdated(id, JobStatus.Funded);
    }

    /// Splits the remaining balance into vendor payout / late penalty / vendor fee.
    function _settlement(Escrow storage e) private view returns (uint256 vendorAmount, uint256 penalty, uint256 vendorFee) {
        uint256 balance = e.escrowBalance;
        if (e.completedAt > e.deadline) {
            penalty = (e.originalAmount * e.penaltyRate) / 100;
            if (penalty > balance) penalty = balance;
        }
        vendorFee = (e.originalAmount * VENDOR_FEE_RATE) / BPS;
        if (vendorFee > balance - penalty) vendorFee = balance - penalty;
        vendorAmount = balance - penalty - vendorFee;
    }

    /// Bumps vendor stats and records the Job NFT. Returns the vendor's new level.
    function _recordCompletion(address vendor, uint256 escrowId) private returns (uint256 level) {
        VendorProfile storage v = vendorProfiles[vendor];
        v.completedJobs += 1;
        level = _levelFor(v.completedJobs);
        v.level = level;
        uint256 tokenId = _jobNftCount++;
        jobNFTs[tokenId] = JobNFT({vendor: vendor, jobId: escrowId, timestamp: block.timestamp, level: level});
        emit JobNFTMinted(vendor, tokenId, level);
    }

    function _payout(address token, address to, uint256 amount) private {
        if (amount == 0) return;
        if (token == address(0)) {
            _sendNative(to, amount);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _sendNative(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "Native transfer failed");
    }

    /// 0-2 completed jobs: level 1 (Beginner); 3-9: level 2 (Pro); 10+: level 3 (Expert).
    function _levelFor(uint256 completed) private pure returns (uint256) {
        if (completed >= 10) return 3;
        if (completed >= 3) return 2;
        return 1;
    }

    function _checkLen(string calldata s, bool required) private pure {
        uint256 len = bytes(s).length;
        require(len <= MAX_FIELD_LEN, "Field too long");
        if (required) require(len > 0, "Required field empty");
    }

    function _checkVendorFields(
        string calldata _businessName,
        string calldata _businessType,
        string calldata _ownerName,
        string calldata _email,
        string calldata _phone,
        string calldata _gstNumber
    ) private pure {
        _checkLen(_businessName, true);
        _checkLen(_businessType, true);
        _checkLen(_ownerName, true);
        _checkLen(_email, false);
        _checkLen(_phone, false);
        _checkLen(_gstNumber, false);
    }

    function _setVendorFields(
        VendorProfile storage v,
        string calldata _businessName,
        string calldata _businessType,
        string calldata _ownerName,
        string calldata _email,
        string calldata _phone,
        string calldata _gstNumber
    ) private {
        v.businessName = _businessName;
        v.businessType = _businessType;
        v.ownerName = _ownerName;
        v.email = _email;
        v.phone = _phone;
        v.gstNumber = _gstNumber;
    }
}
