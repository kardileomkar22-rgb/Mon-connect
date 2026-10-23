// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VerifiedNft
 * @notice Non-transferable (soulbound) role-identity NFT used by the frontend's NFTGuard.
 * Deploy it twice: once for Organizers and once for Service Providers.
 *
 * The frontend calls `safeMint(connectedWallet)` from the user's own wallet and then
 * checks `balanceOf(wallet) > 0`, so minting is open to the wallet itself (one per address).
 * The owner may also mint for another address (e.g. manual verification).
 * Tokens cannot be transferred or burned, so a role badge can't be sold or moved.
 */
contract VerifiedNft is ERC721, Ownable {
    uint256 private _nextTokenId;

    constructor(string memory name_, string memory symbol_, address initialOwner)
        ERC721(name_, symbol_)
        Ownable(initialOwner)
    {}

    function safeMint(address to) external {
        require(to == msg.sender || msg.sender == owner(), "Cannot mint for others");
        require(balanceOf(to) == 0, "Already verified");
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
    }

    /// @dev Allow minting only; block transfers and burns.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        require(from == address(0), "Soulbound: non-transferable");
        return super._update(to, tokenId, auth);
    }
}
