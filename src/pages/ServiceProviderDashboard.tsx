import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import VantaBackground from '../components/VantaBackground';
import WalletButton from '../components/WalletButton';
import { ACTIVE_WALLET_KEY, getProvider, SERVICE_PROVIDER_NFT_ADDRESS } from '../utils/nft';
import { CHAIN_CONNECT_V2_ADDRESS, CHAIN_CONNECT_V2_ABI } from '../utils/chainConnectV2';
import ServiceProviderEscrow from './ServiceProviderEscrow';
import { FaHourglassHalf, FaSave, FaFileAlt, FaCheckCircle, FaTimesCircle, FaMoneyBillWave, FaChartBar } from 'react-icons/fa';

type ViewType = 'verification' | 'dashboard' | 'my-jobs' | 'escrow-payments' | 'update-profile';

interface ServiceProfile {
  walletAddress: string;
  businessName: string;
  businessType: string;
  ownerName: string;
  email: string;
  phone: string;
  gstNumber: string;
  isActive: boolean;
  registeredAt: number;
  completedJobs: number;
  level: number;
}

const ServiceProviderDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [account, setAccount] = useState<string>('');
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [profile, setProfile] = useState<ServiceProfile | null>(null);
  const [formData, setFormData] = useState({
    businessName: '',
    businessType: '',
    ownerName: '',
    email: '',
    phone: '',
    gstNumber: ''
  });
  const [nftCount, setNftCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchNFTCount = useCallback(async (provider: any, address: string) => {
    try {
      const ERC721_ABI = [
        'function balanceOf(address owner) view returns (uint256)',
      ];
      const contract = new ethers.Contract(SERVICE_PROVIDER_NFT_ADDRESS, ERC721_ABI, provider);
      const balance = await contract.balanceOf(address);
      const count = Number(balance);
      setNftCount(count);
    } catch (err) {
      console.error('Failed to fetch NFT count:', err);
    }
  }, []);

  const loadProfileFromBlockchain = useCallback(async (provider: any, address: string) => {
    try {
      const contract = new ethers.Contract(CHAIN_CONNECT_V2_ADDRESS, CHAIN_CONNECT_V2_ABI, provider);
      const vendorProfile = await contract.getVendorProfile(address);
      
      // Check if profile exists (walletAddress will be zero address if not)
      if (vendorProfile.walletAddress !== ethers.ZeroAddress) {
        const loadedProfile: ServiceProfile = {
          walletAddress: vendorProfile.walletAddress,
          businessName: vendorProfile.businessName,
          businessType: vendorProfile.businessType,
          ownerName: vendorProfile.ownerName,
          email: vendorProfile.email,
          phone: vendorProfile.phone,
          gstNumber: vendorProfile.gstNumber,
          isActive: vendorProfile.isActive,
          registeredAt: Number(vendorProfile.registeredAt),
          completedJobs: Number(vendorProfile.completedJobs),
          level: Number(vendorProfile.level)
        };
        
        setProfile(loadedProfile);
        setFormData({
          businessName: loadedProfile.businessName,
          businessType: loadedProfile.businessType,
          ownerName: loadedProfile.ownerName,
          email: loadedProfile.email,
          phone: loadedProfile.phone,
          gstNumber: loadedProfile.gstNumber
        });
      }
    } catch (err) {
      console.error('Failed to load profile from blockchain:', err);
    }
  }, []);

  const loadAccount = useCallback(async () => {
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

        await fetchNFTCount(provider, address);
        await loadProfileFromBlockchain(provider, address);
      } catch (err) {
        console.error('Failed to get account:', err);
      } finally {
        setLoading(false);
      }
    }
  }, [fetchNFTCount, loadProfileFromBlockchain, navigate]);

  useEffect(() => {
    loadAccount();

    const handleAccountsChanged = (accounts: string[]) => {
      const selectedAddress = sessionStorage.getItem(ACTIVE_WALLET_KEY);
      if (!selectedAddress || !accounts.some((wallet) => wallet.toLowerCase() === selectedAddress.toLowerCase())) {
        sessionStorage.removeItem(ACTIVE_WALLET_KEY);
        setAccount('');
        setProfile(null);
        setNftCount(0);
        setLoading(false);
        navigate('/', { replace: true });
        return;
      }
    };

    window.ethereum?.on('accountsChanged', handleAccountsChanged);
    return () => window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
  }, [loadAccount, navigate]);

  const getLevelName = (level: number): string => {
    switch (level) {
      case 3: return 'Expert';
      case 2: return 'Pro';
      case 1: return 'Beginner';
      default: return 'Unranked';
    }
  };

  const getColorForLevel = (level: number): string => {
    switch (level) {
      case 3: return '#FFD700'; // Gold for Expert
      case 2: return '#C0C0C0'; // Silver for Pro
      case 1: return '#CD7F32'; // Bronze for Beginner
      default: return '#6C63FF';
    }
  };

  const handleStartManaging = () => {
    setCurrentView('dashboard');
  };

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
  };

  const handleViewEscrowPayments = () => {
    setCurrentView('escrow-payments');
  };

  const handleUpdateProfile = () => {
    setCurrentView('update-profile');
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      
      // Validate form
      if (!formData.businessName || !formData.businessType || !formData.ownerName) {
        alert('Please fill in Business Name, Business Type, and Owner Name (required fields)');
        return;
      }

      const provider = getProvider();
      if (!provider) {
        alert('Failed to get provider. Please refresh and try again.');
        return;
      }

      const signer = await provider.getSigner(account);
      const contract = new ethers.Contract(CHAIN_CONNECT_V2_ADDRESS, CHAIN_CONNECT_V2_ABI, signer);

      // Register or update vendor on blockchain
      const tx = await contract.registerVendor(
        formData.businessName,
        formData.businessType,
        formData.ownerName,
        formData.email || '',
        formData.phone || '',
        formData.gstNumber || ''
      );

      alert('Registering on blockchain... Please wait for confirmation.');
      await tx.wait();

      // Reload profile from blockchain
      await loadProfileFromBlockchain(provider, account);

      alert('Profile saved successfully on blockchain!');
      setCurrentView('dashboard');
    } catch (err: any) {
      console.error('Error saving profile:', err);
      if (err.code === 'ACTION_REJECTED') {
        alert('Transaction was rejected');
      } else {
        alert('Failed to save profile: ' + (err.message || 'Unknown error'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!profile) return;
    
    const newStatus = !profile.isActive;
    const statusText = newStatus ? 'activate' : 'deactivate';
    
    if (!window.confirm(`Are you sure you want to ${statusText} your account?`)) {
      return;
    }

    try {
      setSaving(true);
      const provider = getProvider();
      if (!provider) {
        alert('Failed to get provider. Please refresh and try again.');
        return;
      }

      const signer = await provider.getSigner(account);
      const contract = new ethers.Contract(CHAIN_CONNECT_V2_ADDRESS, CHAIN_CONNECT_V2_ABI, signer);

      const tx = await contract.setVendorStatus(newStatus);
      alert(`${newStatus ? 'Activating' : 'Deactivating'} your account... Please wait for confirmation.`);
      await tx.wait();

      // Reload profile from blockchain
      await loadProfileFromBlockchain(provider, account);

      alert(`Account ${newStatus ? 'activated' : 'deactivated'} successfully!`);
    } catch (err: any) {
      console.error('Error toggling status:', err);
      if (err.code === 'ACTION_REJECTED') {
        alert('Transaction was rejected');
      } else {
        alert('Failed to update status: ' + (err.message || 'Unknown error'));
      }
    } finally {
      setSaving(false);
    }
  };

  // Render Escrow & Payments view
  if (currentView === 'escrow-payments') {
    return (
      <ServiceProviderEscrow 
        account={account}
        onBack={handleBackToDashboard}
      />
    );
  }

  // Render Update Profile view
  if (currentView === 'update-profile') {
    return (
      <div className="app">
        <VantaBackground />
        <div className="logo">MonConnect</div>

        <div style={{
          maxWidth: '800px',
          margin: '80px auto 0',
          padding: '0 20px 40px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '30px'
          }}>
            <div>
              <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: '#fff' }}>
                {profile ? 'Update Profile' : 'Create Profile'}
              </h1>
              <p style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                {profile ? 'Update your information on the blockchain' : 'Register your service provider profile on the blockchain'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              {account && <WalletButton account={account} />}
              <button 
                onClick={handleBackToDashboard}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '1rem'
                }}
              >
                ← Back
              </button>
            </div>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '12px',
            padding: '30px',
            backdropFilter: 'blur(10px)'
          }}>
            {/* Account Info */}
            <div style={{
              background: 'rgba(108, 99, 255, 0.1)',
              border: '1px solid rgba(108, 99, 255, 0.3)',
              borderRadius: '8px',
              padding: '20px',
              marginBottom: '30px'
            }}>
              <h3 style={{ color: '#fff', marginBottom: '15px' }}>Your Account</h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '15px'
              }}>
                <div>
                  <label style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.9rem' }}>
                    Wallet Address
                  </label>
                  <div style={{ marginTop: '8px' }}>
                    {account && <WalletButton account={account} />}
                  </div>
                </div>
                {profile && (
                  <>
                    <div>
                      <label style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.9rem' }}>
                        Level
                      </label>
                      <div style={{
                        padding: '12px',
                        background: `rgba(${getColorForLevel(profile.level) === '#FFD700' ? '255, 215, 0' : getColorForLevel(profile.level) === '#C0C0C0' ? '192, 192, 192' : '205, 127, 50'}, 0.15)`,
                        border: `2px solid ${getColorForLevel(profile.level)}`,
                        borderRadius: '6px',
                        color: getColorForLevel(profile.level),
                        fontWeight: 'bold',
                        marginTop: '8px'
                      }}>
                        {getLevelName(profile.level)} (Level {profile.level})
                      </div>
                    </div>
                    <div>
                      <label style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.9rem' }}>
                        Completed Jobs
                      </label>
                      <div style={{
                        padding: '12px',
                        background: 'rgba(76, 175, 80, 0.15)',
                        border: '1px solid rgba(76, 175, 80, 0.3)',
                        borderRadius: '6px',
                        color: '#4CAF50',
                        fontWeight: 'bold',
                        marginTop: '8px'
                      }}>
                        {profile.completedJobs} Jobs
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Profile Form */}
            <div style={{ display: 'grid', gap: '20px' }}>
              <div>
                <label style={{ color: '#fff', display: 'block', marginBottom: '8px' }}>
                  Business Name <span style={{ color: '#ff6b6b' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  placeholder="e.g., ABC Event Services"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '1rem'
                  }}
                />
              </div>

              <div>
                <label style={{ color: '#fff', display: 'block', marginBottom: '8px' }}>
                  Business Type <span style={{ color: '#ff6b6b' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.businessType}
                  onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}
                  placeholder="e.g., Catering, Photography, DJ"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '1rem'
                  }}
                />
              </div>

              <div>
                <label style={{ color: '#fff', display: 'block', marginBottom: '8px' }}>
                  Owner Name <span style={{ color: '#ff6b6b' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.ownerName}
                  onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                  placeholder="e.g., John Doe"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '1rem'
                  }}
                />
              </div>

              <div>
                <label style={{ color: '#fff', display: 'block', marginBottom: '8px' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g., contact@business.com"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '1rem'
                  }}
                />
              </div>

              <div>
                <label style={{ color: '#fff', display: 'block', marginBottom: '8px' }}>
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="e.g., +1234567890"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '1rem'
                  }}
                />
              </div>

              <div>
                <label style={{ color: '#fff', display: 'block', marginBottom: '8px' }}>
                  GST Number
                </label>
                <input
                  type="text"
                  value={formData.gstNumber}
                  onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value })}
                  placeholder="e.g., 22AAAAA0000A1Z5"
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '1rem'
                  }}
                />
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={saving}
                style={{
                  width: '100%',
                  padding: '15px',
                  background: saving ? 'rgba(108, 99, 255, 0.5)' : '#6C63FF',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  marginTop: '10px'
                }}
              >
                {saving ? (
                  <>
                    <FaHourglassHalf style={{ marginRight: '8px' }} />
                    Saving to Blockchain...
                  </>
                ) : profile ? (
                  <>
                    <FaSave style={{ marginRight: '8px' }} />
                    Update Profile
                  </>
                ) : (
                  <>
                    <FaFileAlt style={{ marginRight: '8px' }} />
                    Register on Blockchain
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard view
  if (currentView === 'dashboard') {
    return (
      <div className="app">
        <VantaBackground />
        <div className="logo">MonConnect</div>

        <div style={{
          maxWidth: '1200px',
          margin: '80px auto 0',
          padding: '0 20px 40px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '30px'
          }}>
            <div>
              <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: '#fff' }}>
                Service Provider Dashboard
              </h1>
              <p style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                {profile ? `Welcome back, ${profile.businessName}!` : 'Welcome to your dashboard'}
              </p>
            </div>
            <div>
              {account && <WalletButton account={account} />}
            </div>
          </div>

          {/* Profile Status Card */}
          {!profile ? (
            <div style={{
              background: 'rgba(255, 107, 107, 0.1)',
              border: '2px solid rgba(255, 107, 107, 0.3)',
              borderRadius: '12px',
              padding: '30px',
              marginBottom: '30px',
              textAlign: 'center'
            }}>
              <h2 style={{ color: '#ff6b6b', marginBottom: '15px' }}>⚠️ Profile Not Registered</h2>
              <p style={{ color: 'rgba(255, 255, 255, 0.8)', marginBottom: '20px' }}>
                You need to register your profile on the blockchain to start receiving jobs.
              </p>
              <button
                onClick={handleUpdateProfile}
                style={{
                  background: '#ff6b6b',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '15px 30px',
                  color: '#fff',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                <FaFileAlt style={{ marginRight: '8px' }} />
                Register Now
              </button>
            </div>
          ) : (
            <div style={{
              background: 'rgba(108, 99, 255, 0.1)',
              border: '1px solid rgba(108, 99, 255, 0.3)',
              borderRadius: '12px',
              padding: '25px',
              marginBottom: '30px'
            }}>
              <h3 style={{ 
                color: '#fff', 
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <FaChartBar style={{ color: '#4CAF50' }} />
                Your Profile Stats
              </h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '20px'
              }}>
                <div style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: '15px',
                  borderRadius: '8px'
                }}>
                  <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem', marginBottom: '8px' }}>
                    Business Name
                  </div>
                  <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>
                    {profile.businessName}
                  </div>
                </div>
                <div style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: '15px',
                  borderRadius: '8px'
                }}>
                  <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem', marginBottom: '8px' }}>
                    Level
                  </div>
                  <div style={{ color: getColorForLevel(profile.level), fontSize: '1.2rem', fontWeight: 'bold' }}>
                    {getLevelName(profile.level)}
                  </div>
                </div>
                <div style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: '15px',
                  borderRadius: '8px'
                }}>
                  <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem', marginBottom: '8px' }}>
                    Completed Jobs
                  </div>
                  <div style={{ color: '#4CAF50', fontSize: '1.2rem', fontWeight: 'bold' }}>
                    {profile.completedJobs}
                  </div>
                </div>
                <div style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: '15px',
                  borderRadius: '8px'
                }}>
                  <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem', marginBottom: '8px' }}>
                    Status
                  </div>
                  <div style={{ 
                    color: profile.isActive ? '#4CAF50' : '#ff6b6b', 
                    fontSize: '1.2rem', 
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    {profile.isActive ? (
                      <>
                        <FaCheckCircle /> Active
                      </>
                    ) : (
                      <>
                        <FaTimesCircle /> Inactive
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px'
          }}>
            <button
              onClick={handleViewEscrowPayments}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '12px',
                padding: '30px',
                color: '#fff',
                fontSize: '1.1rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.3s'
              }}
            >
              <FaMoneyBillWave style={{ fontSize: '2rem', marginBottom: '10px', color: '#4CAF50' }} />
              <h3 style={{ marginBottom: '10px' }}>My Job Payments</h3>
              <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>
                View escrow details and payment status
              </p>
            </button>

            <button
              onClick={handleUpdateProfile}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '12px',
                padding: '30px',
                color: '#fff',
                fontSize: '1.1rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.3s'
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '10px' }}>⚙️</div>
              <h3 style={{ marginBottom: '10px' }}>Update Profile</h3>
              <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>
                Manage your business information
              </p>
            </button>

            {profile && (
              <button
                onClick={handleToggleStatus}
                disabled={saving}
                style={{
                  background: profile.isActive 
                    ? 'rgba(255, 107, 107, 0.15)' 
                    : 'rgba(76, 175, 80, 0.15)',
                  border: profile.isActive 
                    ? '1px solid rgba(255, 107, 107, 0.4)' 
                    : '1px solid rgba(76, 175, 80, 0.4)',
                  borderRadius: '12px',
                  padding: '30px',
                  color: '#fff',
                  fontSize: '1.1rem',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.3s',
                  opacity: saving ? 0.6 : 1
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: '10px' }}>
                  {profile.isActive ? '🔴' : '🟢'}
                </div>
                <h3 style={{ marginBottom: '10px' }}>
                  {profile.isActive ? 'Deactivate Account' : 'Activate Account'}
                </h3>
                <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>
                  {profile.isActive 
                    ? 'Temporarily disable your account visibility' 
                    : 'Re-enable your account and start receiving jobs'}
                </p>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Verification view (loading or initial state)
  return (
    <div className="app">
      <VantaBackground />
      <div className="logo">MonConnect</div>

      <div className="organizer-card">
        <h1>Service Provider Dashboard</h1>
        {loading ? (
          <p>Loading your profile...</p>
        ) : (
          <>
            <div style={{ marginBottom: '10px' }}>
              {account && <WalletButton account={account} />}
            </div>
            <p>NFTs Owned: {nftCount}</p>
            <button
              onClick={handleStartManaging}
              style={{
                width: '100%',
                padding: '15px',
                background: '#6C63FF',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginTop: '20px'
              }}
            >
              Start Managing
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ServiceProviderDashboard;
