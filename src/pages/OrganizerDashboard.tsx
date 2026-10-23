import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useNavigate } from 'react-router-dom';
import VantaBackground from '../components/VantaBackground';
import { ACTIVE_WALLET_KEY, getProvider, ORGANIZER_NFT_ADDRESS } from '../utils/nft';
import { ESCROW_ABI, ESCROW_CONTRACT_ADDRESS, ORGANIZER_FEE_RATE } from '../utils/escrow';
import { CHAIN_CONNECT_V2_ADDRESS, CHAIN_CONNECT_V2_ABI } from '../utils/chainConnectV2';
import EscrowAndPayments from './EscrowAndPayments';
import WalletButton from '../components/WalletButton';
import { FaCheckCircle } from 'react-icons/fa';


interface ActivityItem {
  id: string;
  title: string;
  status: 'completed' | 'pending';
  amount: string;
}

interface HireFormData {
  vendorAddress: string;
  jobAmount: string;
  deadline: string;
  penaltyRate: string;
  tokenType: 'ETH' | 'Token';
}

type ViewType = 'verification' | 'dashboard' | 'browse-vendors' | 'escrow-payments' | 'my-events' | 'view-vendor-profile';

const OrganizerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [account, setAccount] = useState<string>('');
  const [currentView, setCurrentView] = useState<ViewType>('verification');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedService, setSelectedService] = useState<string>('All services');
  const [selectedLevel, setSelectedLevel] = useState<string>('Levels');
  const [showHireDialog, setShowHireDialog] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<any>(null);
  const [selectedVendorProfile, setSelectedVendorProfile] = useState<any>(null);
  const [vendors, setVendors] = useState<any[]>([
    { id: '1', name: 'Gourmet catering and co', category: 'Catering', level: 'Gold' }
  ]);
  const [hireFormData, setHireFormData] = useState<HireFormData>({
    vendorAddress: '',
    jobAmount: '',
    deadline: '',
    penaltyRate: '5',
    tokenType: 'ETH'
  });
  const [escrowRefreshTrigger, setEscrowRefreshTrigger] = useState(0);
  
  // Real-time stats from blockchain
  const [dashboardStats, setDashboardStats] = useState({
    activeJobs: 0,
    completedJobs: 0,
    totalSpent: '0',
    escrowLocked: '0'
  });
  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);

  useEffect(() => {
    const loadAccount = async () => {
      const provider = getProvider();
      if (provider) {
        try {
          const selectedAddress = sessionStorage.getItem(ACTIVE_WALLET_KEY);
          if (!selectedAddress) {
            navigate('/', { replace: true });
            return;
          }
          const signer = await provider.getSigner(selectedAddress);
          const address = await signer.getAddress();
          setAccount(address);
        } catch (err) {
          console.error('Failed to get account:', err);
        }
      }

        const handleAccountsChanged = (accounts: string[]) => {
          const selectedAddress = sessionStorage.getItem(ACTIVE_WALLET_KEY);
          if (!selectedAddress || !accounts.some((wallet) => wallet.toLowerCase() === selectedAddress.toLowerCase())) {
            sessionStorage.removeItem(ACTIVE_WALLET_KEY);
            setAccount('');
            navigate('/', { replace: true });
          }
        };

        window.ethereum?.on('accountsChanged', handleAccountsChanged);
        return () => window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
    };
    loadAccount();

    const handleAccountsChanged = (accounts: string[]) => {
      setAccount(accounts[0] || '');
    };

    window.ethereum?.on('accountsChanged', handleAccountsChanged);
    return () => window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
  }, [navigate]);

  // Load vendors from blockchain
  useEffect(() => {
    const loadVendors = async () => {
      try {
        const provider = getProvider();
        if (provider) {
          const contract = new ethers.Contract(CHAIN_CONNECT_V2_ADDRESS, CHAIN_CONNECT_V2_ABI, provider);
          const activeVendors = await contract.getActiveVendors();
          
          // Transform blockchain data to match frontend format
          const transformedVendors = activeVendors.map((vendor: any, index: number) => ({
            id: vendor.walletAddress,
            walletAddress: vendor.walletAddress,
            name: vendor.businessName,
            ownerName: vendor.ownerName,
            category: vendor.businessType,
            email: vendor.email,
            phone: vendor.phone,
            gstNumber: vendor.gstNumber,
            level: Number(vendor.level),
            levelName: Number(vendor.level) === 3 ? 'Expert' : Number(vendor.level) === 2 ? 'Pro' : 'Beginner',
            nftCount: Number(vendor.completedJobs),
            completedJobs: Number(vendor.completedJobs),
            isActive: vendor.isActive
          }));
          
          console.log('[OrganizerDashboard] Loaded vendors from blockchain:', transformedVendors);
          setVendors(transformedVendors);
        }
      } catch (err) {
        console.error('Error loading vendors from blockchain:', err);
        // Don't set fallback vendors - show empty list if blockchain fetch fails
        setVendors([]);
      }
    };
    loadVendors();

    // Set up interval to refresh vendors every 10 seconds
    const interval = setInterval(loadVendors, 10000);
    return () => clearInterval(interval);
  }, []);

  // Load dashboard stats from blockchain
  useEffect(() => {
    const loadDashboardStats = async () => {
      if (!account) return;
      
      try {
        const provider = getProvider();
        if (!provider) return;
        
        const contract = new ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, provider);
        
        // Get total number of escrows
        const totalEscrows = await contract.getTotalEscrows();
        const totalEscrowsNum = typeof totalEscrows === 'bigint' ? Number(totalEscrows) : totalEscrows.toNumber();
        
        let activeJobs = 0;
        let completedJobs = 0;
        let totalSpentWei = BigInt(0);
        let escrowLockedWei = BigInt(0);
        const activities: ActivityItem[] = [];
        
        // Fetch all escrows created by this organizer
        for (let i = 0; i < totalEscrowsNum; i++) {
          try {
            const escrow = await contract.getEscrow(i);
            
            // Only count escrows where current account is the organizer
            if (escrow.organizer.toLowerCase() === account.toLowerCase()) {
              const status = Number(escrow.status);
              const amount = ethers.formatEther(escrow.originalAmount);
              
              // Active jobs: Funded (1), InProgress (2), Completed (3)
              if (status === 1 || status === 2 || status === 3) {
                activeJobs++;
                // Escrow locked = active jobs total amount
                escrowLockedWei += escrow.originalAmount;
                
                // Add to recent activities
                if (activities.length < 5) {
                  let statusText = 'pending';
                  let title = '';
                  if (status === 1) {
                    title = `Job #${i} - Escrow Funded`;
                    statusText = 'pending';
                  } else if (status === 2) {
                    title = `Job #${i} - In Progress`;
                    statusText = 'pending';
                  } else if (status === 3) {
                    title = `Job #${i} - Completed, awaiting release`;
                    statusText = 'pending';
                  }
                  activities.push({
                    id: i.toString(),
                    title,
                    status: statusText as 'completed' | 'pending',
                    amount: `${parseFloat(amount).toFixed(4)} MON`
                  });
                }
              }
              
              // Completed jobs: Released (4)
              if (status === 4) {
                completedJobs++;
                // Total spent = released payments
                totalSpentWei += escrow.originalAmount;
                
                // Add to recent activities
                if (activities.length < 5) {
                  activities.push({
                    id: i.toString(),
                    title: `Job #${i} - Payment Released`,
                    status: 'completed',
                    amount: `${parseFloat(amount).toFixed(4)} MON`
                  });
                }
              }
            }
          } catch (err) {
            console.error(`Error fetching escrow ${i}:`, err);
          }
        }
        
        // Sort activities by ID descending (most recent first)
        activities.sort((a, b) => parseInt(b.id) - parseInt(a.id));
        
        setDashboardStats({
          activeJobs,
          completedJobs,
          totalSpent: ethers.formatEther(totalSpentWei),
          escrowLocked: ethers.formatEther(escrowLockedWei)
        });
        
        setRecentActivities(activities.length > 0 ? activities : [{
          id: '0',
          title: 'No recent activity',
          status: 'pending',
          amount: '0 MON'
        }]);
        
        console.log('[OrganizerDashboard] Stats updated:', {
          activeJobs,
          completedJobs,
          totalSpent: ethers.formatEther(totalSpentWei),
          escrowLocked: ethers.formatEther(escrowLockedWei)
        });
      } catch (err) {
        console.error('Error loading dashboard stats:', err);
      }
    };
    
    loadDashboardStats();
    
    // Refresh stats every 15 seconds
    const interval = setInterval(loadDashboardStats, 15000);
    return () => clearInterval(interval);
  }, [account, escrowRefreshTrigger]);
 
  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  const handleStartCreating = () => {
    setCurrentView('dashboard');
  };

  const handleBrowseVendors = () => {
    setCurrentView('browse-vendors');
  };

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
  };

  const handleOpenEscrowPayments = () => {
    setCurrentView('escrow-payments');
  };

  const handleViewVendorProfile = async (vendor: any) => {
    // Fetch full vendor profile from blockchain
    try {
      const provider = getProvider();
      if (provider) {
        const contract = new ethers.Contract(CHAIN_CONNECT_V2_ADDRESS, CHAIN_CONNECT_V2_ABI, provider);
        const profile = await contract.getVendorProfile(vendor.walletAddress);
        
        // Set the profile data with blockchain information
        setSelectedVendorProfile({
          walletAddress: profile.walletAddress,
          businessName: profile.businessName,
          businessType: profile.businessType,
          ownerName: profile.ownerName,
          email: profile.email,
          phone: profile.phone,
          gstNumber: profile.gstNumber,
          isActive: profile.isActive,
          completedJobs: Number(profile.completedJobs),
          level: Number(profile.level),
          registeredAt: Number(profile.registeredAt)
        });
        setCurrentView('view-vendor-profile');
      }
    } catch (error) {
      console.error('Error fetching vendor profile:', error);
      alert('Failed to load vendor profile from blockchain');
    }
  };

  const handleHireAndFund = (vendor: any) => {
    setSelectedVendor(vendor);
    setHireFormData({
      vendorAddress: vendor.walletAddress || '', // Auto-populate from vendor's wallet address
      jobAmount: '',
      deadline: '',
      penaltyRate: '5',
      tokenType: 'ETH'
    });
    setShowHireDialog(true);
  };

  const handleCloseHireDialog = () => {
    setShowHireDialog(false);
    setSelectedVendor(null);
  };

  const handleSubmitHireForm = async () => {
    try {
      // Validate form
      if (!hireFormData.vendorAddress.trim()) {
        alert('Please enter vendor address');
        return;
      }
      if (!hireFormData.jobAmount.trim()) {
        alert('Please enter job amount');
        return;
      }
      if (!hireFormData.deadline.trim()) {
        alert('Please select deadline');
        return;
      }
      if (!hireFormData.penaltyRate.trim()) {
        alert('Please enter penalty rate');
        return;
      }

      const penaltyRateNum = parseInt(hireFormData.penaltyRate);
      if (isNaN(penaltyRateNum) || penaltyRateNum < 0 || penaltyRateNum > 50) {
        alert('Penalty rate must be between 0 and 50%');
        return;
      }

      console.log('Creating escrow with data:', hireFormData);

      // Validate and format vendor address
      let vendorAddress: string;
      try {
        // Checksum the address (converts to proper format)
        vendorAddress = ethers.getAddress(hireFormData.vendorAddress.trim());
      } catch (err) {
        alert('Invalid vendor address format. Please enter a valid Ethereum address.');
        return;
      }

      // Get organizer address
      const provider = await getProvider();
      const signer = await provider.getSigner(account);
      const organizerAddress = await signer.getAddress();

      // Check if vendor and organizer are the same
      if (vendorAddress.toLowerCase() === organizerAddress.toLowerCase()) {
        alert('Error: Vendor cannot be the same as organizer. Please use a different wallet address for the vendor.');
        return;
      }

      const jobAmount = ethers.parseEther(hireFormData.jobAmount);
      const deadlineTimestamp = Math.floor(new Date(hireFormData.deadline).getTime() / 1000);
      const penaltyRate = penaltyRateNum;

      // Calculate organizer fee only (1% in basis points = 100)
      // IMPORTANT: Contract only expects jobAmount + organizer fee
      // Vendor fee (1%) is deducted later when payment is released
      const organizerFee = (jobAmount * BigInt(ORGANIZER_FEE_RATE)) / BigInt(10000);
      const totalAmount = jobAmount + organizerFee;

      const contract = new ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, signer);

      console.log('Sending transaction to create escrow...');
      console.log({
        organizer: organizerAddress,
        vendor: vendorAddress,
        jobAmount: ethers.formatEther(jobAmount),
        organizerFee: ethers.formatEther(organizerFee),
        totalAmount: ethers.formatEther(totalAmount),
        deadline: deadlineTimestamp,
        penalty: penaltyRate
      });
      console.log('Note: Vendor fee (1%) will be deducted when payment is released, not now');

      // Call contract function based on token type
      let tx;
      if (hireFormData.tokenType === 'ETH') {
        // Native token (ETH/MON) - send totalAmount (job + fees)
        tx = await contract.createEscrowNative(
          vendorAddress,
          jobAmount,
          deadlineTimestamp,
          penaltyRate,
          { value: totalAmount }  // Send job amount + fees
        );
      } else {
        // Custom ERC20 token - for now, use zero address
        tx = await contract.createEscrowToken(
          vendorAddress,
          jobAmount,
          ethers.ZeroAddress,
          deadlineTimestamp,
          penaltyRate
        );
      }

      console.log('Transaction sent:', tx.hash);
      console.log('Waiting for confirmation...');

      // Wait for transaction confirmation
      const receipt = await tx.wait();
      console.log('Escrow created successfully!', receipt);

      // Extract escrow ID from events if available
      let escrowId = 'N/A';
      if (receipt.logs && receipt.logs.length > 0) {
        try {
          // Try to parse the EscrowCreated event
          const iface = new ethers.Interface(ESCROW_ABI);
          for (const log of receipt.logs) {
            try {
              const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
              if (parsed && parsed.name === 'EscrowCreated') {
                escrowId = parsed.args[0].toString();
                console.log('Escrow ID from event:', escrowId);
                break;
              }
            } catch (e) {
              // Skip logs that can't be parsed
            }
          }
        } catch (e) {
          console.error('Error parsing events:', e);
        }
      }

      alert(`✓ Escrow created successfully!\n\nEscrow ID: ${escrowId}\nTransaction: ${receipt.transactionHash}`);
      
      // Close dialog
      handleCloseHireDialog();
      
      // Wait a moment for blockchain state to settle
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Trigger refresh in EscrowAndPayments component
      setEscrowRefreshTrigger(prev => prev + 1);
      
      // Navigate to escrow payments tab
      setCurrentView('escrow-payments');

    } catch (error: any) {
      console.error('Error submitting hire form:', error);
      
      // Handle specific errors
      if (error.code === 'ACTION_REJECTED') {
        alert('Transaction rejected by user');
      } else if (error.code === 'INSUFFICIENT_FUNDS') {
        alert('Insufficient balance to create escrow');
      } else if (error.message && error.message.includes('invalid address')) {
        alert('Invalid vendor address format. Please enter a valid Ethereum address (0x...)');
      } else if (error.message && error.message.includes('Organizer cannot be vendor')) {
        alert('Error: Vendor cannot be the same as organizer. Please use a different wallet address for the vendor.');
      } else {
        alert('Failed to create escrow. Error: ' + (error.message || error.toString()));
      }
    }
  };

  if (currentView === 'escrow-payments') {
    return (
      <EscrowAndPayments 
        account={account} 
        onBack={handleBackToDashboard}
        onBrowseVendors={handleBrowseVendors}
        refreshTrigger={escrowRefreshTrigger}
      />
    );
  }

  if (currentView === 'view-vendor-profile' && selectedVendorProfile) {
    const getLevelColor = (level: number) => {
      if (level === 3) return '#FFD700'; // Gold
      if (level === 2) return '#C0C0C0'; // Silver
      return '#CD7F32'; // Bronze
    };

    const getLevelName = (level: number) => {
      if (level === 3) return 'Expert';
      if (level === 2) return 'Pro';
      return 'Beginner';
    };

    return (
      <div className="app" style={{ minHeight: '100vh', position: 'relative' }}>
        <VantaBackground />
        <div className="logo">MonConnect</div>
        
        <div style={{ position: 'relative', zIndex: 2, paddingTop: '80px', paddingBottom: '40px' }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            maxWidth: '1400px',
            margin: '0 auto',
            padding: '0 40px',
            marginBottom: '40px'
          }}>
            <h1 style={{ color: '#fff', fontSize: '1.8rem', margin: 0 }}>Vendor Profile</h1>
            <div>
              {account && <WalletButton account={account} />}
            </div>
          </div>

          {/* Main Content */}
          <div style={{
            maxWidth: '900px',
            margin: '0 auto',
            padding: '0 40px'
          }}>
            {/* Back Button */}
            <button
              onClick={() => setCurrentView('browse-vendors')}
              style={{
                padding: '10px 20px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.95rem',
                marginBottom: '25px',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
            >
              ← Back to Browse Vendors
            </button>

            {/* Profile Card */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '16px',
              padding: '40px',
              backdropFilter: 'blur(10px)'
            }}>
              {/* Header Section */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '30px',
                paddingBottom: '25px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div>
                  <h2 style={{ 
                    color: '#fff', 
                    fontSize: '2rem', 
                    margin: '0 0 10px 0',
                    fontWeight: '600'
                  }}>
                    {selectedVendorProfile.businessName}
                  </h2>
                  <p style={{ 
                    color: 'rgba(255, 255, 255, 0.7)', 
                    fontSize: '1.1rem',
                    margin: '0 0 10px 0'
                  }}>
                    {selectedVendorProfile.businessType}
                  </p>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    background: `rgba(${getLevelColor(selectedVendorProfile.level) === '#FFD700' ? '255, 215, 0' : getLevelColor(selectedVendorProfile.level) === '#C0C0C0' ? '192, 192, 192' : '205, 127, 50'}, 0.15)`,
                    border: `2px solid ${getLevelColor(selectedVendorProfile.level)}`,
                    borderRadius: '20px',
                    color: getLevelColor(selectedVendorProfile.level),
                    fontSize: '0.9rem',
                    fontWeight: '600'
                  }}>
                    ⭐ {getLevelName(selectedVendorProfile.level)} Level
                  </div>
                </div>
                <div style={{
                  background: selectedVendorProfile.isActive ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
                  border: selectedVendorProfile.isActive ? '1px solid #4CAF50' : '1px solid #F44336',
                  borderRadius: '20px',
                  padding: '8px 16px',
                  color: selectedVendorProfile.isActive ? '#4CAF50' : '#F44336',
                  fontSize: '0.9rem',
                  fontWeight: '600'
                }}>
                  {selectedVendorProfile.isActive ? '● Active' : '● Inactive'}
                </div>
              </div>

              {/* Stats Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '20px',
                marginBottom: '35px'
              }}>
                <div style={{
                  background: 'rgba(108, 99, 255, 0.15)',
                  border: '1px solid rgba(108, 99, 255, 0.3)',
                  borderRadius: '12px',
                  padding: '20px',
                  textAlign: 'center'
                }}>
                  <div style={{ 
                    color: 'rgba(255, 255, 255, 0.6)', 
                    fontSize: '0.85rem',
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Completed Jobs
                  </div>
                  <div style={{ 
                    color: '#6C63FF', 
                    fontSize: '2rem',
                    fontWeight: '700'
                  }}>
                    {selectedVendorProfile.completedJobs}
                  </div>
                </div>
                <div style={{
                  background: 'rgba(108, 99, 255, 0.15)',
                  border: '1px solid rgba(108, 99, 255, 0.3)',
                  borderRadius: '12px',
                  padding: '20px',
                  textAlign: 'center'
                }}>
                  <div style={{ 
                    color: 'rgba(255, 255, 255, 0.6)', 
                    fontSize: '0.85rem',
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Member Since
                  </div>
                  <div style={{ 
                    color: '#6C63FF', 
                    fontSize: '1.2rem',
                    fontWeight: '600'
                  }}>
                    {new Date(selectedVendorProfile.registeredAt * 1000).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div style={{ marginBottom: '30px' }}>
                <h3 style={{ 
                  color: '#fff', 
                  fontSize: '1.3rem',
                  marginBottom: '20px',
                  fontWeight: '600'
                }}>
                  Contact Information
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div>
                    <label style={{ 
                      color: 'rgba(255, 255, 255, 0.6)', 
                      fontSize: '0.85rem',
                      display: 'block',
                      marginBottom: '6px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Owner Name
                    </label>
                    <div style={{ 
                      color: '#fff', 
                      fontSize: '1rem',
                      padding: '12px 16px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px'
                    }}>
                      {selectedVendorProfile.ownerName}
                    </div>
                  </div>
                  <div>
                    <label style={{ 
                      color: 'rgba(255, 255, 255, 0.6)', 
                      fontSize: '0.85rem',
                      display: 'block',
                      marginBottom: '6px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Email
                    </label>
                    <div style={{ 
                      color: '#fff', 
                      fontSize: '1rem',
                      padding: '12px 16px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px'
                    }}>
                      {selectedVendorProfile.email}
                    </div>
                  </div>
                  <div>
                    <label style={{ 
                      color: 'rgba(255, 255, 255, 0.6)', 
                      fontSize: '0.85rem',
                      display: 'block',
                      marginBottom: '6px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Phone
                    </label>
                    <div style={{ 
                      color: '#fff', 
                      fontSize: '1rem',
                      padding: '12px 16px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px'
                    }}>
                      {selectedVendorProfile.phone}
                    </div>
                  </div>
                </div>
              </div>

              {/* Business Information */}
              <div style={{ marginBottom: '30px' }}>
                <h3 style={{ 
                  color: '#fff', 
                  fontSize: '1.3rem',
                  marginBottom: '20px',
                  fontWeight: '600'
                }}>
                  Business Information
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div>
                    <label style={{ 
                      color: 'rgba(255, 255, 255, 0.6)', 
                      fontSize: '0.85rem',
                      display: 'block',
                      marginBottom: '6px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Wallet Address
                    </label>
                    <div style={{ 
                      color: '#6C63FF', 
                      fontSize: '0.95rem',
                      padding: '12px 16px',
                      background: 'rgba(108, 99, 255, 0.1)',
                      border: '1px solid rgba(108, 99, 255, 0.3)',
                      borderRadius: '8px',
                      fontFamily: 'monospace',
                      wordBreak: 'break-all'
                    }}>
                      {selectedVendorProfile.walletAddress}
                    </div>
                  </div>
                  <div>
                    <label style={{ 
                      color: 'rgba(255, 255, 255, 0.6)', 
                      fontSize: '0.85rem',
                      display: 'block',
                      marginBottom: '6px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      GST Number
                    </label>
                    <div style={{ 
                      color: '#fff', 
                      fontSize: '1rem',
                      padding: '12px 16px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px'
                    }}>
                      {selectedVendorProfile.gstNumber}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ 
                display: 'flex', 
                gap: '15px',
                paddingTop: '20px',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <button
                  onClick={() => {
                    const vendor = {
                      walletAddress: selectedVendorProfile.walletAddress,
                      name: selectedVendorProfile.businessName,
                      category: selectedVendorProfile.businessType,
                      level: getLevelName(selectedVendorProfile.level)
                    };
                    handleHireAndFund(vendor);
                  }}
                  style={{
                    flex: 1,
                    padding: '14px 24px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #6C63FF 0%, #5A52CC 100%)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '600',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 15px rgba(108, 99, 255, 0.3)'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(108, 99, 255, 0.4)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 15px rgba(108, 99, 255, 0.3)';
                  }}
                >
                  Hire and Fund
                </button>
                <button
                  onClick={() => setCurrentView('browse-vendors')}
                  style={{
                    padding: '14px 24px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    background: 'transparent',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '600',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === 'my-events') {
    return (
      <div className="app" style={{ minHeight: '100vh', position: 'relative' }}>
        <VantaBackground />
        <div className="logo">MonConnect</div>
        
        <div style={{ position: 'relative', zIndex: 2, paddingTop: '80px', paddingBottom: '40px', padding: '80px 40px 40px' }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '30px'
          }}>
            <div>
              <button
                onClick={handleBackToDashboard}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '8px',
                  color: '#fff',
                  padding: '10px 20px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  marginBottom: '15px',
                  transition: 'all 0.3s ease'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
              >
                ← Back to Dashboard
              </button>
              <h1 style={{ color: '#fff', fontSize: '2rem', margin: 0 }}>My Events</h1>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {account && <WalletButton account={account} />}
            </div>
          </div>

          {/* Add Event Button */}
          <div style={{ marginBottom: '30px' }}>
            <button
              onClick={() => setShowHireDialog(true)}
              style={{
                background: 'linear-gradient(135deg, #6C63FF 0%, #5A52D5 100%)',
                border: 'none',
                borderRadius: '10px',
                color: '#fff',
                padding: '14px 28px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 15px rgba(108, 99, 255, 0.4)'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              + Add New Event
            </button>
          </div>

          {/* Events List Placeholder */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '12px',
            padding: '40px',
            textAlign: 'center',
            backdropFilter: 'blur(10px)'
          }}>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '1.1rem' }}>
              No events created yet. Click "Add New Event" to create your first event!
            </p>
          </div>
        </div>

        {/* Event Creation Dialog */}
        {showHireDialog && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(30, 30, 60, 0.95) 0%, rgba(20, 20, 40, 0.98) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '16px',
              padding: '30px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
            }}>
              <h2 style={{ color: '#fff', marginBottom: '25px', fontSize: '1.8rem' }}>Create New Event</h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Event Name */}
                <div>
                  <label style={{ color: 'rgba(255, 255, 255, 0.8)', display: 'block', marginBottom: '8px', fontSize: '0.95rem' }}>
                    Event Name *
                  </label>
                  <input
                    type="text"
                    value={hireFormData.vendorAddress}
                    onChange={(e) => setHireFormData({...hireFormData, vendorAddress: e.target.value})}
                    placeholder="e.g., Tech Conference 2025"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: '#fff',
                      fontSize: '1rem',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Organizer Name */}
                <div>
                  <label style={{ color: 'rgba(255, 255, 255, 0.8)', display: 'block', marginBottom: '8px', fontSize: '0.95rem' }}>
                    Organizer Name *
                  </label>
                  <input
                    type="text"
                    value={hireFormData.jobAmount}
                    onChange={(e) => setHireFormData({...hireFormData, jobAmount: e.target.value})}
                    placeholder="Your name or organization"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: '#fff',
                      fontSize: '1rem',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* What are you looking for */}
                <div>
                  <label style={{ color: 'rgba(255, 255, 255, 0.8)', display: 'block', marginBottom: '8px', fontSize: '0.95rem' }}>
                    Services Needed *
                  </label>
                  <select
                    value={hireFormData.tokenType}
                    onChange={(e) => setHireFormData({...hireFormData, tokenType: e.target.value as 'ETH' | 'Token'})}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: '#fff',
                      fontSize: '1rem',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="ETH" style={{ background: '#1a1a2e', color: '#fff' }}>Merchandise</option>
                    <option value="Token" style={{ background: '#1a1a2e', color: '#fff' }}>Catering</option>
                    <option value="Token" style={{ background: '#1a1a2e', color: '#fff' }}>Photography</option>
                    <option value="Token" style={{ background: '#1a1a2e', color: '#fff' }}>Videography</option>
                    <option value="Token" style={{ background: '#1a1a2e', color: '#fff' }}>Sound & Lighting</option>
                    <option value="Token" style={{ background: '#1a1a2e', color: '#fff' }}>Venue Decoration</option>
                    <option value="Token" style={{ background: '#1a1a2e', color: '#fff' }}>Security</option>
                    <option value="Token" style={{ background: '#1a1a2e', color: '#fff' }}>Transportation</option>
                  </select>
                </div>

                {/* Capacity */}
                <div>
                  <label style={{ color: 'rgba(255, 255, 255, 0.8)', display: 'block', marginBottom: '8px', fontSize: '0.95rem' }}>
                    Expected Attendees *
                  </label>
                  <input
                    type="number"
                    value={hireFormData.penaltyRate}
                    onChange={(e) => setHireFormData({...hireFormData, penaltyRate: e.target.value})}
                    placeholder="e.g., 500"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: '#fff',
                      fontSize: '1rem',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Event Date & Time */}
                <div>
                  <label style={{ color: 'rgba(255, 255, 255, 0.8)', display: 'block', marginBottom: '8px', fontSize: '0.95rem' }}>
                    Event Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={hireFormData.deadline}
                    onChange={(e) => setHireFormData({...hireFormData, deadline: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: '#fff',
                      fontSize: '1rem',
                      outline: 'none',
                      colorScheme: 'dark'
                    }}
                  />
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                  <button
                    onClick={() => {
                      alert('Event created successfully! (This is a demo - connect to backend to save)');
                      setShowHireDialog(false);
                    }}
                    style={{
                      flex: 1,
                      padding: '14px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #6C63FF 0%, #5A52D5 100%)',
                      color: '#fff',
                      fontSize: '1rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                  >
                    Create Event
                  </button>
                  <button
                    onClick={handleCloseHireDialog}
                    style={{
                      flex: 1,
                      padding: '14px',
                      borderRadius: '8px',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      background: 'transparent',
                      color: '#fff',
                      fontSize: '1rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (currentView === 'browse-vendors') {
    return (
      <div className="app" style={{ minHeight: '100vh', position: 'relative' }}>
        <VantaBackground />
        <div className="logo">MonConnect</div>
        
        <div style={{ position: 'relative', zIndex: 2, paddingTop: '80px', paddingBottom: '40px' }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            maxWidth: '1400px',
            margin: '0 auto',
            padding: '0 40px',
            marginBottom: '40px'
          }}>
            <h1 style={{ color: '#fff', fontSize: '1.8rem', margin: 0 }}>Browse vendors</h1>
            <div>
              {account && <WalletButton account={account} />}
            </div>
          </div>

          {/* Main Content */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '250px 1fr',
            gap: '30px',
            maxWidth: '1400px',
            margin: '0 auto',
            padding: '0 40px'
          }}>
            {/* Sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '12px',
                padding: '20px',
                backdropFilter: 'blur(10px)'
              }}>
                <nav style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    color: 'rgba(255, 255, 255, 0.7)',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    fontWeight: '400',
                    transition: 'all 0.3s ease'
                  }}
                  onClick={handleBackToDashboard}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                  }}>
                    Dashboard
                  </div>
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    fontWeight: '500',
                    background: 'rgba(108, 99, 255, 0.3)',
                    border: '1px solid rgba(108, 99, 255, 0.5)',
                    transition: 'all 0.3s ease'
                  }}>
                    Browse Vendors
                  </div>
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    color: 'rgba(255, 255, 255, 0.7)',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    fontWeight: '400',
                    transition: 'all 0.3s ease'
                  }}
                  onClick={() => setCurrentView('my-events')}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                  }}>
                    My Events
                  </div>
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    color: 'rgba(255, 255, 255, 0.7)',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    fontWeight: '400',
                    transition: 'all 0.3s ease'
                  }}
                  onClick={handleOpenEscrowPayments}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                  }}>
                    Escrow and Payments
                  </div>
                </nav>
              </div>
            </div>

            {/* Main Panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {/* Search and Filters */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              padding: '25px',
              backdropFilter: 'blur(10px)',
              marginBottom: '30px'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '15px'
              }}>
                {/* Search Input */}
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    color: '#fff',
                    fontSize: '1rem',
                    outline: 'none',
                    transition: 'all 0.3s ease',
                    fontFamily: 'inherit'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                  }}
                />

                {/* All Services Dropdown */}
                <div style={{ position: 'relative' }}>
                  <select
                    value={selectedService}
                    onChange={(e) => setSelectedService(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      paddingRight: '40px',
                      borderRadius: '8px',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      color: '#fff',
                      fontSize: '1rem',
                      outline: 'none',
                      transition: 'all 0.3s ease',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      appearance: 'none',
                      backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3e%3cpolyline points=%226 9 12 15 18 9%22%3e%3c/polyline%3e%3c/svg%3e")',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 10px center',
                      backgroundSize: '20px'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    }}
                  >
                    <option value="All services" style={{ backgroundColor: '#000', color: '#fff' }}>All services</option>
                    <option value="Catering" style={{ backgroundColor: '#000', color: '#fff' }}>Catering</option>
                    <option value="3D Printing" style={{ backgroundColor: '#000', color: '#fff' }}>3D Printing</option>
                    <option value="Co-working" style={{ backgroundColor: '#000', color: '#fff' }}>Co-working</option>
                    <option value="Photography" style={{ backgroundColor: '#000', color: '#fff' }}>Photography</option>
                    <option value="Printing and Signage" style={{ backgroundColor: '#000', color: '#fff' }}>Printing and Signage</option>
                    <option value="Marketing" style={{ backgroundColor: '#000', color: '#fff' }}>Marketing</option>
                    <option value="Merchandise" style={{ backgroundColor: '#000', color: '#fff' }}>Merchandise</option>
                  
                  </select>
                </div>

                {/* Levels Dropdown */}
                <div style={{ position: 'relative' }}>
                  <select
                    value={selectedLevel}
                    onChange={(e) => setSelectedLevel(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      paddingRight: '40px',
                      borderRadius: '8px',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      color: '#fff',
                      fontSize: '1rem',
                      outline: 'none',
                      transition: 'all 0.3s ease',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      appearance: 'none',
                      backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3e%3cpolyline points=%226 9 12 15 18 9%22%3e%3c/polyline%3e%3c/svg%3e")',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 10px center',
                      backgroundSize: '20px'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    }}
                  >
                    <option value="Levels" style={{ backgroundColor: '#000', color: '#fff' }}>Levels</option>
                    <option value="Gold" style={{ backgroundColor: '#000', color: '#fff' }}>Gold</option>
                    <option value="Silver" style={{ backgroundColor: '#000', color: '#fff' }}>Silver</option>
                    <option value="Bronze" style={{ backgroundColor: '#000', color: '#fff' }}>Bronze</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Vendor Cards Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '20px'
            }}>
              {vendors.map((vendor: any) => (
                <div key={vendor.id} style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '12px',
                  padding: '20px',
                  backdropFilter: 'blur(10px)',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                  e.currentTarget.style.transform = 'translateY(-5px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}>
                  <h3 style={{ color: '#fff', fontSize: '1rem', marginBottom: '12px', margin: '0 0 12px 0' }}>
                    {vendor.name}
                  </h3>
                  
                  <div style={{ marginBottom: '15px' }}>
                    <span style={{
                      display: 'inline-block',
                      color: 'rgba(255, 255, 255, 0.7)',
                      fontSize: '0.9rem',
                      marginRight: '10px'
                    }}>
                      {vendor.category}
                    </span>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: '1px solid rgba(210, 167, 234, 0.5)',
                      color: '#ffffffff',
                      fontSize: '0.85rem'
                    }}>
                      {vendor.level}
                    </span>
                  </div>

                  <div style={{
                    display: 'flex',
                    gap: '10px',
                    justifyContent: 'space-between'
                  }}>
                    <button
                      onClick={() => handleViewVendorProfile(vendor)}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        backgroundColor: 'transparent',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: '500',
                        transition: 'all 0.3s ease'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                      }}
                    >
                      View profile
                    </button>
                    <button
                      onClick={() => handleHireAndFund(vendor)}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: 'rgba(108, 99, 255, 0.3)',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: '500',
                        transition: 'all 0.3s ease'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(108, 99, 255, 0.5)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(108, 99, 255, 0.3)';
                      }}
                    >
                      Hire and Fund
                    </button>
                  </div>
                </div>
              ))}
            </div>
            </div>
          </div>
        </div>

        {/* Hire and Fund Dialog */}
        {showHireDialog && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(5px)'
          }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              padding: '40px',
              maxWidth: '500px',
              width: '90%',
              backdropFilter: 'blur(10px)',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}>
              <h2 style={{ color: '#fff', fontSize: '1.5rem', marginBottom: '30px', margin: '0 0 30px 0' }}>
                Hire and Fund
              </h2>

              {selectedVendor && (
                <div style={{
                  background: 'rgba(108, 99, 255, 0.2)',
                  border: '1px solid rgba(108, 99, 255, 0.5)',
                  borderRadius: '8px',
                  padding: '15px',
                  marginBottom: '25px'
                }}>
                  <p style={{ color: 'rgba(255, 255, 255, 0.8)', margin: '0 0 8px 0' }}>
                    <strong>Vendor:</strong> {selectedVendor.name}
                  </p>
                  <p style={{ color: 'rgba(255, 255, 255, 0.6)', margin: 0, fontSize: '0.9rem' }}>
                    {selectedVendor.category} • {selectedVendor.level}
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Vendor Address */}
                <div>
                  <label style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.9rem', display: 'block', marginBottom: '8px' }}>
                    Vendor Address
                    
                  </label>
                  <input
                    type="text"
                    value={hireFormData.vendorAddress}
                    onChange={(e) => setHireFormData({ ...hireFormData, vendorAddress: e.target.value })}
                    placeholder="0x..."
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: hireFormData.vendorAddress ? '1px solid rgba(76, 175, 80, 0.5)' : '1px solid rgba(255, 255, 255, 0.3)',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      color: '#fff',
                      fontSize: '1rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                      transition: 'all 0.3s ease'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.borderColor = hireFormData.vendorAddress ? 'rgba(76, 175, 80, 0.5)' : 'rgba(255, 255, 255, 0.3)';
                    }}
                  />
                  {hireFormData.vendorAddress && (
                    <p style={{ fontSize: '0.8rem', color: 'rgba(76, 175, 80, 0.8)', marginTop: '4px' }}>
                      {formatAddress(hireFormData.vendorAddress)}
                    </p>
                  )}
                </div>

                {/* Job Amount */}
                <div>
                  <label style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.9rem', display: 'block', marginBottom: '8px' }}>
                    Job Amount ({hireFormData.tokenType})
                  </label>
                  <input
                    type="number"
                    value={hireFormData.jobAmount}
                    onChange={(e) => setHireFormData({ ...hireFormData, jobAmount: e.target.value })}
                    placeholder="0.5"
                    min="0"
                    step="0.01"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      color: '#fff',
                      fontSize: '1rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                      transition: 'all 0.3s ease'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    }}
                  />
                  
                  {/* Fee Breakdown */}
                  {hireFormData.jobAmount && (
                    <div style={{
                      marginTop: '10px',
                      padding: '12px',
                      backgroundColor: 'rgba(108, 99, 255, 0.1)',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      color: 'rgba(255, 255, 255, 0.7)'
                    }}>
                      <div style={{ marginBottom: '4px' }}>
                        Job Amount: <span style={{ color: '#fff' }}>{hireFormData.jobAmount} {hireFormData.tokenType}</span>
                      </div>
                      <div style={{ marginBottom: '4px' }}>
                        Platform Fee (1%): <span style={{ color: '#fff' }}>{(parseFloat(hireFormData.jobAmount) * 0.01).toFixed(4)} {hireFormData.tokenType}</span>
                      </div>
                      <div style={{
                        paddingTop: '8px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.2)',
                        marginTop: '8px',
                        fontWeight: '500'
                      }}>
                        Total to Send: <span style={{ color: '#6C63FF' }}>{(parseFloat(hireFormData.jobAmount) * 1.01).toFixed(4)} {hireFormData.tokenType}</span>
                      </div>
                      <div style={{ 
                        marginTop: '8px', 
                        fontSize: '0.75rem',
                        color: 'rgba(255, 255, 255, 0.5)',
                        fontStyle: 'italic'
                      }}>
                        Note: Vendor fee (1%) will be deducted when payment is released
                      </div>
                    </div>
                  )}
                </div>

                {/* Token Type */}
                <div>
                  <label style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.9rem', display: 'block', marginBottom: '8px' }}>
                    Token Type
                  </label>
                  <select
                    value={hireFormData.tokenType}
                    onChange={(e) => setHireFormData({ ...hireFormData, tokenType: e.target.value as 'ETH' | 'Token' })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      color: '#fff',
                      fontSize: '1rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    }}
                  >
                    <option value="ETH" style={{ backgroundColor: '#000', color: '#fff' }}>MON (Native Token)</option>
                    <option value="Token" style={{ backgroundColor: '#000', color: '#fff' }}>Custom Token</option>
                  </select>
                </div>

                {/* Deadline */}
                <div>
                  <label style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.9rem', display: 'block', marginBottom: '8px' }}>
                    Deadline
                  </label>
                  <input
                    type="date"
                    value={hireFormData.deadline}
                    onChange={(e) => setHireFormData({ ...hireFormData, deadline: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      color: '#fff',
                      fontSize: '1rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    }}
                  />
                </div>

                {/* Penalty Rate */}
                <div>
                  <label style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.9rem', display: 'block', marginBottom: '8px' }}>
                    Penalty Rate (%) - Max 50%
                  </label>
                  <input
                    type="number"
                    value={hireFormData.penaltyRate}
                    onChange={(e) => setHireFormData({ ...hireFormData, penaltyRate: e.target.value })}
                    placeholder="5"
                    min="0"
                    max="50"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      color: '#fff',
                      fontSize: '1rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                      transition: 'all 0.3s ease'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    }}
                  />
                </div>

                {/* Buttons */}
                <div style={{
                  display: 'flex',
                  gap: '15px',
                  marginTop: '30px'
                }}>
                  <button
                    onClick={handleSubmitHireForm}
                    style={{
                      flex: 1,
                      padding: '12px 20px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: 'rgba(108, 99, 255, 0.3)',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: '500',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(108, 99, 255, 0.5)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(108, 99, 255, 0.3)';
                    }}
                  >
                    Create Escrow
                  </button>
                  <button
                    onClick={handleCloseHireDialog}
                    style={{
                      flex: 1,
                      padding: '12px 20px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      backgroundColor: 'transparent',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: '500',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (currentView === 'dashboard') {
    return (
      <div className="app" style={{ minHeight: '100vh', position: 'relative' }}>
        <VantaBackground />
        <div className="logo">MonConnect</div>
        
        <div style={{ position: 'relative', zIndex: 2, paddingTop: '80px', paddingBottom: '40px' }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            maxWidth: '1400px',
            margin: '0 auto',
            padding: '0 40px',
            marginBottom: '40px'
          }}>
            <h1 style={{ color: '#fff', fontSize: '1.8rem', margin: 0 }}>Organizer Dashboard</h1>
            {account && <WalletButton account={account} />}
          </div>

          {/* Main Content */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '250px 1fr',
            gap: '30px',
            maxWidth: '1400px',
            margin: '0 auto',
            padding: '0 40px'
          }}>
            {/* Sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '12px',
                padding: '20px',
                backdropFilter: 'blur(10px)'
              }}>
                <nav style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    fontWeight: '500',
                    background: 'rgba(108, 99, 255, 0.3)',
                    border: '1px solid rgba(108, 99, 255, 0.5)',
                    transition: 'all 0.3s ease'
                  }}>
                    Dashboard
                  </div>
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    color: 'rgba(255, 255, 255, 0.7)',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    fontWeight: '400',
                    transition: 'all 0.3s ease'
                  }}
                  onClick={handleBrowseVendors}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                  }}>
                    Browse Vendors
                  </div>
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    color: 'rgba(255, 255, 255, 0.7)',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    fontWeight: '400',
                    transition: 'all 0.3s ease'
                  }}
                  onClick={() => setCurrentView('my-events')}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                  }}>
                    My Events
                  </div>
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    color: 'rgba(255, 255, 255, 0.7)',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    fontWeight: '400',
                    transition: 'all 0.3s ease'
                  }}
                  onClick={handleOpenEscrowPayments}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                  }}>
                    Escrow and Payments
                  </div>
                </nav>
              </div>
            </div>

            {/* Main Panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
              {/* Stats Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '20px'
              }}>
                {[
                  { label: 'Active jobs', value: dashboardStats.activeJobs.toString(), color: '#FFA500' },
                  { label: 'Completed jobs', value: dashboardStats.completedJobs.toString(), color: '#4CAF50' },
                  { label: 'Total Spent', value: `${parseFloat(dashboardStats.totalSpent).toFixed(4)} MON`, color: '#6C63FF' },
                  { label: 'Escrow locked', value: `${parseFloat(dashboardStats.escrowLocked).toFixed(4)} MON`, color: '#FF6B6B' }
                ].map((stat, idx) => (
                  <div key={idx} style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '12px',
                    padding: '20px',
                    textAlign: 'center',
                    backdropFilter: 'blur(10px)',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  }}>
                    <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '8px' }}>
                      {stat.label}
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: '600', color: stat.color }}>
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Recent Activity */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '12px',
                padding: '25px',
                backdropFilter: 'blur(10px)'
              }}>
                <h2 style={{ color: '#fff', fontSize: '1.3rem', marginBottom: '20px', margin: '0 0 20px 0' }}>
                  Recent activity
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {recentActivities.map((activity) => (
                    <div key={activity.id} style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      padding: '15px 20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    }}>
                      <span style={{ color: '#fff', fontSize: '0.95rem' }}>{activity.title}</span>
                      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '0.85rem',
                          background: activity.status === 'completed' 
                            ? 'rgba(76, 175, 80, 0.3)'
                            : 'rgba(255, 152, 0, 0.3)',
                          color: activity.status === 'completed' ? '#4CAF50' : '#FFA500',
                          textTransform: 'capitalize'
                        }}>
                          {activity.status}
                        </span>
                        <span style={{ color: '#fff', fontWeight: '600', minWidth: '60px', textAlign: 'right' }}>
                          {activity.amount}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Verification screen (initial state)
  return (
    <div className="app" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh'
    }}>
      <VantaBackground />
      <div className="logo">MonConnect</div>
      
      <div className="auth-container page-enter" style={{ 
        maxWidth: '900px', 
        padding: '3rem',
        textAlign: 'center',
        margin: '0 auto'
      }}>
        <h1 style={{ 
          fontSize: '2.5rem', 
          marginBottom: '1rem', 
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px'
        }}>
          <FaCheckCircle style={{ color: '#4CAF50' }} />
          Congratulations, Organizer!
        </h1>
        
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.1)', 
          padding: '2rem', 
          borderRadius: '12px',
          marginTop: '2rem',
          backdropFilter: 'blur(10px)'
        }}>
          <h2 style={{ color: '#4CAF50', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" fill="#4CAF50"/>
              <path d="M8 12L11 15L16 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            You're Verified as an Event Organizer!
          </h2>

          <p style={{ fontSize: '1.1rem', lineHeight: '1.8', color: '#e0e0e0', marginBottom: '2rem' }}>
            You successfully minted your Organizer Verified Access NFT! You can now access all organizer features and start creating amazing events.
          </p>
          
          <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(76, 175, 80, 0.2)', borderRadius: '8px' }}>
            <h3 style={{ color: '#fff', marginBottom: '1rem' }}>Your NFT Details</h3>
            <div style={{ color: '#e0e0e0', textAlign: 'left', maxWidth: '500px', margin: '0 auto' }}>
              <p style={{ marginBottom: '0.5rem', wordBreak: 'break-all' }}>
                <strong>Contract:</strong> {ORGANIZER_NFT_ADDRESS}
              </p>
              <p style={{ marginBottom: '0.5rem' }}>
                <strong>Network:</strong> Monad Testnet (Chain ID: 10143)
              </p>
              <p style={{ marginBottom: '0.5rem' }}>
                <strong>Your Wallet:</strong> {formatAddress(account)}
              </p>
              <p style={{ marginBottom: '0' }}>
                <strong>Status:</strong> <span style={{ color: '#4CAF50' }}>Active & Verified</span>
              </p>
            </div>
          </div>

          
        </div>

        <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-secondary"
            onClick={() => window.location.href = '/'}
          >
            ← Back to Home
          </button>
          <button 
            className="btn btn-primary"
            onClick={handleStartCreating}
          >
            Start Creating Events
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrganizerDashboard;
