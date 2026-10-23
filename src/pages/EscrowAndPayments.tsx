import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import VantaBackground from '../components/VantaBackground';
import { getProvider } from '../utils/nft';
import { ESCROW_ABI, ESCROW_CONTRACT_ADDRESS, getJobStatusFromNumber } from '../utils/escrow';
import { FaCheckCircle, FaMoneyBillWave, FaClock, FaInfoCircle, FaTimes, FaSync, FaHourglassHalf, FaChartBar } from 'react-icons/fa';

interface EscrowJob {
  id: string;
  vendor: string;
  amount: string;
  originalAmount: string;
  escrowBalance: string;
  paidAmount: string;
  tokenType: 'ETH' | 'Token';
  status: 'Funded' | 'InProgress' | 'Completed' | 'Released' | 'Refunded' | 'Add Payment in escrow';
  deadline: string;
  penaltyRate: string;
  advanceApproved: boolean;
  proofUrl?: string;
}

interface EscrowAndPaymentsProps {
  account: string;
  onBack: () => void;
  onBrowseVendors?: () => void;
  refreshTrigger?: number;
}

const EscrowAndPayments: React.FC<EscrowAndPaymentsProps> = ({ account, onBack, onBrowseVendors, refreshTrigger = 0 }) => {
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [escrowJobs, setEscrowJobs] = useState<EscrowJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualRefresh, setManualRefresh] = useState(0);
  const [selectedJob, setSelectedJob] = useState<EscrowJob | null>(null);
  const [showJobDetails, setShowJobDetails] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [notifications, setNotifications] = useState<Array<{id: string, message: string, timestamp: number}>>([]);

  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Filter jobs based on active tab
  const filteredJobs = escrowJobs.filter(job => {
    if (activeTab === 'active') {
      return job.status === 'Funded' || job.status === 'InProgress' || job.status === 'Completed';
    } else {
      return job.status === 'Released' || job.status === 'Refunded';
    }
  });

  // Add notification
  const addNotification = (message: string) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, timestamp: Date.now() }]);
    // Auto remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  // Remove notification manually
  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Fetch escrow jobs from contract on component mount
  useEffect(() => {
    
    const fetchEscrowJobs = async () => {
      try {
        setLoading(true);
        console.log('Starting to fetch escrow jobs for account:', account);
        const provider = await getProvider();
        console.log('Provider obtained');
        
        const contract = new ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, provider);
        console.log('Contract connected at:', ESCROW_CONTRACT_ADDRESS);
        
        const totalEscrows = await contract.getTotalEscrows();
        const totalEscrowsNum = Number(totalEscrows);
        console.log('Total escrows on contract:', totalEscrowsNum);
        
        if (totalEscrowsNum === 0) {
          console.log('No escrows found on contract');
          setEscrowJobs([]);
          setLoading(false);
          return;
        }
        
        const jobs: EscrowJob[] = [];
        
        // Fetch all escrows for this account
        console.log(`Fetching ${totalEscrowsNum} escrow(s)...`);
        for (let i = 0; i < totalEscrowsNum; i++) {
          try {
            console.log(`Fetching escrow ${i}...`);
            const escrow = await contract.getEscrow(i);
            console.log(`Escrow ${i}:`, {
              organizer: escrow.organizer,
              vendor: escrow.vendor,
              status: escrow.status.toString(),
              originalAmount: escrow.originalAmount.toString(),
              escrowBalance: escrow.escrowBalance.toString()
            });
            
            // Calculate paid amount
            const originalAmountBigInt = escrow.originalAmount;
            const escrowBalanceBigInt = escrow.escrowBalance;
            const paidAmountBigInt = originalAmountBigInt - escrowBalanceBigInt;
            
            const tokenSymbol = escrow.tokenAddress === ethers.ZeroAddress ? 'MON' : 'Token';
            
            if (escrow.organizer.toLowerCase() !== account.toLowerCase()) {
              continue;
            }

            const job: EscrowJob = {
              id: escrow.id.toString(),
              vendor: formatAddress(escrow.vendor),
              amount: ethers.formatEther(escrow.originalAmount) + ' ' + tokenSymbol,
              originalAmount: ethers.formatEther(originalAmountBigInt) + ' ' + tokenSymbol,
              escrowBalance: ethers.formatEther(escrowBalanceBigInt) + ' ' + tokenSymbol,
              paidAmount: ethers.formatEther(paidAmountBigInt) + ' ' + tokenSymbol,
              tokenType: escrow.tokenAddress === ethers.ZeroAddress ? 'ETH' : 'Token',
              status: getJobStatusFromNumber(escrow.status) as any,
              deadline: new Date(Number(escrow.deadline) * 1000).toLocaleDateString(),
              penaltyRate: escrow.penaltyRate.toString() + '%',
              advanceApproved: escrow.advanceApproved,
              proofUrl: escrow.proofUrl || undefined
            };
            jobs.push(job);
          } catch (err) {
            console.error(`Could not fetch escrow ${i}:`, err);
          }
        }
        
        console.log('Fetched jobs from contract:', jobs);
        
        // Check for new funded escrows and notify
        const prevJobIds = escrowJobs.map(j => j.id);
        const newJobs = jobs.filter(j => !prevJobIds.includes(j.id) && j.status === 'Funded');
        
        if (newJobs.length > 0 && escrowJobs.length > 0) { // Only notify if not first load
          newJobs.forEach(job => {
            addNotification(`New escrow created! Job #${job.id} - ${job.originalAmount} has been funded`);
          });
        }
        
        setEscrowJobs(jobs);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching escrow jobs:', error);
        setLoading(false);
      }
    };

    if (account) {
      fetchEscrowJobs();
    } else {
      console.log('No account provided');
      setLoading(false);
    }
  }, [account, refreshTrigger, manualRefresh]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Funded':
        return { bg: 'rgba(100, 150, 255, 0.3)', text: '#6496FF' };
      case 'InProgress':
        return { bg: 'rgba(255, 152, 0, 0.3)', text: '#FFA500' };
      case 'Completed':
        return { bg: 'rgba(76, 175, 80, 0.3)', text: '#4CAF50' };
      case 'Released':
        return { bg: 'rgba(76, 175, 80, 0.3)', text: '#4CAF50' };
      case 'Refunded':
        return { bg: 'rgba(244, 67, 54, 0.3)', text: '#F44336' };
      case 'Add Payment in escrow':
        return { bg: 'rgba(233, 30, 99, 0.3)', text: '#E91E63' };
      default:
        return { bg: 'rgba(255, 255, 255, 0.1)', text: '#fff' };
    }
  };

  const handleViewDetails = (job: EscrowJob) => {
    setSelectedJob(job);
    setShowJobDetails(true);
  };

  // Organizer Actions
  const handleApproveAdvance = async (jobId: string) => {
    if (!window.confirm('Approve 15% advance payment for this job?')) {
      return;
    }

    try {
      setActionLoading(true);
      const provider = getProvider();
      if (!provider) throw new Error('Provider not available');

      const signer = await provider.getSigner(account);
      const signerAddress = await signer.getAddress();
      if (signerAddress.toLowerCase() !== account.toLowerCase()) {
        throw new Error('The selected wallet changed. Refresh the escrow list and try again with the organizer wallet.');
      }

      const contract = new ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, signer);
      const escrow = await contract.getEscrow(jobId);
      if (escrow.organizer.toLowerCase() !== signerAddress.toLowerCase()) {
        throw new Error(`This escrow belongs to organizer ${escrow.organizer}, but the connected wallet is ${signerAddress}. Switch to the organizer wallet that created this escrow.`);
      }
      
      console.log('Approving advance for job:', jobId);
      const tx = await contract.approveAdvancePayment(jobId);
      alert('Approving advance payment... Please wait for confirmation.');
      await tx.wait();
      
      alert('Advance payment approved and sent to vendor!');
      setShowJobDetails(false);
      setManualRefresh(prev => prev + 1);
    } catch (err: any) {
      console.error('Error approving advance:', err);
      if (err.code === 'ACTION_REJECTED') {
        alert('Transaction was rejected');
      } else {
        alert('Failed to approve advance: ' + (err.message || 'Unknown error'));
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleReleasePayment = async (jobId: string) => {
    if (!window.confirm('Release remaining payment to vendor? This action cannot be undone.')) {
      return;
    }

    try {
      setActionLoading(true);
      const provider = getProvider();
      if (!provider) throw new Error('Provider not available');

      const signer = await provider.getSigner(account);
      const contract = new ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, signer);
      
      // Get escrow details before release
      const escrow = await contract.getEscrow(jobId);
      console.log('Escrow before release:', {
        id: escrow.id.toString(),
        vendor: escrow.vendor,
        escrowBalance: ethers.formatEther(escrow.escrowBalance),
        status: escrow.status.toString()
      });
      
      // Check contract balance
      const contractBalance = await provider.getBalance(ESCROW_CONTRACT_ADDRESS);
      console.log('Contract balance:', ethers.formatEther(contractBalance), 'MON');
      
      console.log('Releasing payment for job:', jobId);
      const tx = await contract.releasePayment(jobId, {
        gasLimit: 500000 // Set explicit gas limit
      });
      console.log('Transaction sent:', tx.hash);
      alert('Releasing payment... Please wait for confirmation.');
      
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt);
      console.log('Gas used:', receipt.gasUsed.toString());
      
      alert('Payment released successfully! Vendor NFT minted.');
      setShowJobDetails(false);
      setManualRefresh(prev => prev + 1);
    } catch (err: any) {
      console.error('Error releasing payment:', err);
      console.error('Error details:', {
        code: err.code,
        message: err.message,
        data: err.data
      });
      if (err.code === 'ACTION_REJECTED') {
        alert('Transaction was rejected');
      } else {
        alert('Failed to release payment: ' + (err.message || 'Unknown error'));
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefund = async (jobId: string) => {
    if (!window.confirm('Refund this escrow? This will cancel the job and return funds to you.')) {
      return;
    }

    try {
      setActionLoading(true);
      const provider = getProvider();
      if (!provider) throw new Error('Provider not available');

      const signer = await provider.getSigner(account);
      const contract = new ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, signer);
      
      console.log('Refunding escrow:', jobId);
      const tx = await contract.refundEscrow(jobId);
      alert('Refunding escrow... Please wait for confirmation.');
      await tx.wait();
      
      alert('Escrow refunded successfully!');
      setShowJobDetails(false);
      setManualRefresh(prev => prev + 1);
    } catch (err: any) {
      console.error('Error refunding escrow:', err);
      if (err.code === 'ACTION_REJECTED') {
        alert('Transaction was rejected');
      } else {
        alert('Failed to refund: ' + (err.message || 'Unknown error'));
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (showJobDetails && selectedJob) {
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
            <h1 style={{ color: '#fff', fontSize: '1.8rem', margin: 0 }}>Job Details</h1>
            <button
              onClick={() => setShowJobDetails(false)}
              style={{
                padding: '10px 20px',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '1rem',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.25)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
              }}
            >
              ← Back
            </button>
          </div>

          {/* Main Content */}
          <div style={{
            maxWidth: '900px',
            margin: '0 auto',
            padding: '0 40px'
          }}>
            {/* Progress Tracker */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '2px solid transparent',
              borderRadius: '16px',
              padding: '28px',
              marginBottom: '30px',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.3), 0 16px 32px rgba(0, 0, 0, 0.15)',
              position: 'relative'
            }}>
              <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FaChartBar style={{ color: '#4CAF50' }} /> Job Progress Timeline
              </h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                {/* Progress Line */}
                <div style={{
                  position: 'absolute',
                  top: '20px',
                  left: '50px',
                  right: '50px',
                  height: '2px',
                  background: 'linear-gradient(to right, rgba(108, 99, 255, 0.3) 0%, rgba(108, 99, 255, 0.1) 100%)',
                  zIndex: 0
                }} />
                
                {[
                  { label: 'Funded', icon: <FaMoneyBillWave />, active: ['Funded', 'InProgress', 'Completed', 'Released'].includes(selectedJob.status) },
                  { label: 'In Progress', icon: <FaHourglassHalf />, active: ['InProgress', 'Completed', 'Released'].includes(selectedJob.status) },
                  { label: 'Completed', icon: <FaClock />, active: ['Completed', 'Released'].includes(selectedJob.status) },
                  { label: 'Released', icon: <FaCheckCircle />, active: selectedJob.status === 'Released' }
                ].map((step, idx) => (
                  <div key={idx} style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    position: 'relative',
                    zIndex: 1,
                    flex: 1
                  }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: step.active 
                        ? 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)'
                        : 'rgba(255, 255, 255, 0.1)',
                      border: step.active ? '2px solid rgba(108, 99, 255, 0.5)' : '2px solid rgba(255, 255, 255, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.2rem',
                      boxShadow: step.active ? '0 0 20px rgba(108, 99, 255, 0.5)' : 'none',
                      transition: 'all 0.3s ease',
                      animation: step.active && idx === [
                        ['Funded', 'InProgress', 'Completed', 'Released'].includes(selectedJob.status) ? 0 : -1,
                        ['InProgress', 'Completed', 'Released'].includes(selectedJob.status) ? 1 : -1,
                        ['Completed', 'Released'].includes(selectedJob.status) ? 2 : -1,
                        selectedJob.status === 'Released' ? 3 : -1
                      ].filter(i => i >= 0).pop() ? 'pulse 2s infinite' : 'none'
                    }}>
                      {step.icon}
                    </div>
                    <div style={{ 
                      marginTop: '10px', 
                      color: step.active ? '#fff' : 'rgba(255, 255, 255, 0.5)',
                      fontSize: '0.85rem',
                      fontWeight: step.active ? '600' : '400',
                      textAlign: 'center'
                    }}>
                      {step.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              padding: '30px',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
            }}>
              {/* Job Info */}
              <div style={{ marginBottom: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2 style={{ color: '#fff', fontSize: '1.5rem', margin: 0 }}>
                    Job ID: #{selectedJob.id}
                  </h2>
                  <div style={{
                    padding: '8px 16px',
                    borderRadius: '20px',
                    background: selectedJob.status === 'Released' ? 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)' :
                               selectedJob.status === 'Completed' ? 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)' :
                               selectedJob.status === 'InProgress' ? 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)' :
                               'linear-gradient(135deg, #6C63FF 0%, #5753d1 100%)',
                    color: '#fff',
                    fontWeight: '600',
                    fontSize: '0.9rem',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    animation: 'fadeIn 0.5s ease'
                  }}>
                    {selectedJob.status}
                  </div>
                </div>
                
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '20px',
                  marginBottom: '30px'
                }}>
                  {[
                    { label: 'Vendor', value: selectedJob.vendor, gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
                    { label: 'Original Amount', value: selectedJob.originalAmount, gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
                    { label: 'Current Balance', value: selectedJob.escrowBalance, gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
                    { label: 'Paid Amount', value: selectedJob.paidAmount, gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
                    { label: 'Token Type', value: selectedJob.tokenType, gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
                    { label: 'Deadline', value: selectedJob.deadline, gradient: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)' },
                    { label: 'Penalty Rate', value: selectedJob.penaltyRate, gradient: 'linear-gradient(135deg, #ff9a56 0%, #ff6a88 100%)' },
                    { label: 'Advance Approved', value: selectedJob.advanceApproved ? 'Yes' : 'No', gradient: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)' }
                  ].map((item, idx) => (
                    <div 
                      key={idx} 
                      style={{
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '2px solid transparent',
                        borderRadius: '14px',
                        padding: '20px',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        cursor: 'default',
                        animation: `fadeIn 0.5s ease ${idx * 0.05}s both`,
                        backdropFilter: 'blur(16px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                        boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.2), 0 8px 24px rgba(0, 0, 0, 0.12)'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 0 0 1px rgba(255, 255, 255, 0.4), 0 16px 32px rgba(0, 0, 0, 0.18)';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 0 0 1px rgba(255, 255, 255, 0.2), 0 8px 24px rgba(0, 0, 0, 0.12)';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                      }}
                    >
                      {/* Gradient accent line */}
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '2px',
                        background: item.gradient,
                        opacity: 0.5
                      }} />
                      
                      <div style={{ 
                        color: 'rgba(255, 255, 255, 0.6)', 
                        fontSize: '0.8rem', 
                        marginBottom: '12px',
                        fontWeight: '600',
                        letterSpacing: '0.8px',
                        textTransform: 'uppercase'
                      }}>
                        {item.label}
                      </div>
                      
                      <div style={{ 
                        color: '#fff', 
                        fontSize: item.label === 'Vendor' ? '0.9rem' : '1.15rem', 
                        fontWeight: '600',
                        wordBreak: item.label === 'Vendor' ? 'break-all' : 'normal',
                        letterSpacing: '0.3px',
                        lineHeight: '1.4'
                      }}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Proof URL */}
              {selectedJob.proofUrl && (
                <div style={{ 
                  marginBottom: '30px',
                  padding: '22px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '2px solid transparent',
                  borderRadius: '14px',
                  position: 'relative',
                  overflow: 'hidden',
                  backdropFilter: 'blur(16px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                  boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.2), 0 8px 24px rgba(0, 0, 0, 0.12)'
                }}>
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '2px',
                    background: 'linear-gradient(90deg, #6C63FF 0%, #5753d1 100%)',
                    opacity: 0.6
                  }} />
                  <h3 style={{ 
                    color: '#fff', 
                    marginBottom: '14px',
                    fontSize: '1rem',
                    fontWeight: '600',
                    letterSpacing: '0.3px'
                  }}>
                    Proof of Completion
                  </h3>
                  <a
                    href={selectedJob.proofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#6C63FF',
                      textDecoration: 'none',
                      wordBreak: 'break-all',
                      fontSize: '0.9rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 14px',
                      background: 'rgba(108, 99, 255, 0.1)',
                      borderRadius: '8px',
                      border: '1px solid rgba(108, 99, 255, 0.2)',
                      transition: 'all 0.3s ease',
                      fontWeight: '500'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(108, 99, 255, 0.15)';
                      e.currentTarget.style.borderColor = 'rgba(108, 99, 255, 0.4)';
                      e.currentTarget.style.transform = 'translateX(4px)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'rgba(108, 99, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(108, 99, 255, 0.2)';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    {selectedJob.proofUrl}
                  </a>
                </div>
              )}

              {/* Actions */}
              <div style={{
                display: 'flex',
                gap: '15px',
                flexWrap: 'wrap',
                marginTop: '30px',
                paddingTop: '30px',
                borderTop: '1px solid rgba(255, 255, 255, 0.2)'
              }}>
                
                {/* Approve Advance Payment (InProgress status, not yet approved) */}
                {selectedJob.status === 'InProgress' && !selectedJob.advanceApproved && (
                  <button
                    onClick={() => handleApproveAdvance(selectedJob.id)}
                    disabled={actionLoading}
                    style={{
                      flex: 1,
                      minWidth: '150px',
                      padding: '14px 24px',
                      borderRadius: '12px',
                      border: '2px solid transparent',
                      background: actionLoading ? 'rgba(108, 99, 255, 0.1)' : 'linear-gradient(135deg, #6C63FF 0%, #5753d1 100%)',
                      color: '#fff',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                      fontSize: '0.95rem',
                      fontWeight: '600',
                      letterSpacing: '0.5px',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      opacity: actionLoading ? 0.6 : 1,
                      boxShadow: actionLoading ? 'none' : '0 0 0 1px rgba(108, 99, 255, 0.3), 0 8px 24px rgba(108, 99, 255, 0.2)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                    onMouseOver={(e) => {
                      if (!actionLoading) {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 0 0 1px rgba(108, 99, 255, 0.5), 0 16px 32px rgba(108, 99, 255, 0.3)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!actionLoading) {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 0 0 1px rgba(108, 99, 255, 0.3), 0 8px 24px rgba(108, 99, 255, 0.2)';
                      }
                    }}
                  >
                    {actionLoading ? 'Processing...' : 'Approve Advance Payment'}
                  </button>
                )}

                {/* Release Payment (Completed status) */}
                {selectedJob.status === 'Completed' && (
                  <button
                    onClick={() => handleReleasePayment(selectedJob.id)}
                    disabled={actionLoading}
                    style={{
                      flex: 1,
                      minWidth: '150px',
                      padding: '14px 24px',
                      borderRadius: '12px',
                      border: '2px solid transparent',
                      background: actionLoading ? 'rgba(76, 175, 80, 0.1)' : 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
                      color: '#fff',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                      fontSize: '0.95rem',
                      fontWeight: '600',
                      letterSpacing: '0.5px',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      opacity: actionLoading ? 0.6 : 1,
                      boxShadow: actionLoading ? 'none' : '0 0 0 1px rgba(76, 175, 80, 0.3), 0 8px 24px rgba(76, 175, 80, 0.2)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                    onMouseOver={(e) => {
                      if (!actionLoading) {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 0 0 1px rgba(76, 175, 80, 0.5), 0 16px 32px rgba(76, 175, 80, 0.3)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!actionLoading) {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 0 0 1px rgba(76, 175, 80, 0.3), 0 8px 24px rgba(76, 175, 80, 0.2)';
                      }
                    }}
                  >
                    {actionLoading ? 'Processing...' : 'Release Payment'}
                  </button>
                )}

                {/* Refund Escrow (Only show if advance payment NOT approved yet) */}
                {(selectedJob.status === 'Funded' || selectedJob.status === 'Completed') && (
                  <button
                    onClick={() => handleRefund(selectedJob.id)}
                    disabled={actionLoading}
                    style={{
                      flex: 1,
                      minWidth: '150px',
                      padding: '14px 24px',
                      borderRadius: '12px',
                      border: '2px solid transparent',
                      background: actionLoading ? 'rgba(244, 67, 54, 0.08)' : 'rgba(244, 67, 54, 0.12)',
                      backdropFilter: 'blur(16px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                      color: '#ff6b6b',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                      fontSize: '0.95rem',
                      fontWeight: '600',
                      letterSpacing: '0.5px',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      opacity: actionLoading ? 0.6 : 1,
                      boxShadow: '0 0 0 1px rgba(244, 67, 54, 0.3), 0 8px 24px rgba(244, 67, 54, 0.15)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                    onMouseOver={(e) => {
                      if (!actionLoading) {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.background = 'rgba(244, 67, 54, 0.18)';
                        e.currentTarget.style.boxShadow = '0 0 0 1px rgba(244, 67, 54, 0.5), 0 16px 32px rgba(244, 67, 54, 0.25)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!actionLoading) {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.background = 'rgba(244, 67, 54, 0.12)';
                        e.currentTarget.style.boxShadow = '0 0 0 1px rgba(244, 67, 54, 0.3), 0 8px 24px rgba(244, 67, 54, 0.15)';
                      }
                    }}
                  >
                    {actionLoading ? 'Processing...' : 'Refund Escrow'}
                  </button>
                )}

                <button
                  onClick={() => setShowJobDetails(false)}
                  style={{
                    flex: 1,
                    minWidth: '150px',
                    padding: '14px 24px',
                    borderRadius: '12px',
                    border: '2px solid transparent',
                    background: 'rgba(255, 255, 255, 0.06)',
                    backdropFilter: 'blur(16px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    fontWeight: '600',
                    letterSpacing: '0.5px',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.2), 0 8px 24px rgba(0, 0, 0, 0.1)'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 0 0 1px rgba(255, 255, 255, 0.35), 0 16px 32px rgba(0, 0, 0, 0.15)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 0 0 1px rgba(255, 255, 255, 0.2), 0 8px 24px rgba(0, 0, 0, 0.1)';
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
          <h1 style={{ color: '#fff', fontSize: '1.8rem', margin: 0 }}>Escrow and Payments</h1>
          <button
            onClick={onBack}
            style={{
              padding: '10px 20px',
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '1rem',
              transition: 'all 0.3s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.25)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
            }}
          >
            ← Back to Dashboard
          </button>
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
                onClick={onBack}
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
                  color: 'rgba(255, 255, 255, 0.7)',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: '400',
                  transition: 'all 0.3s ease'
                }}
                onClick={onBrowseVendors}
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
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: '500',
                  background: 'rgba(108, 99, 255, 0.3)',
                  border: '1px solid rgba(108, 99, 255, 0.5)',
                  transition: 'all 0.3s ease'
                }}>
                  Escrow and Payments
                </div>
              </nav>
            </div>
          </div>

          {/* Main Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* Platform Fee Disclaimer */}
          <div style={{
            background: 'rgba(108, 99, 255, 0.1)',
            border: '1px solid rgba(108, 99, 255, 0.3)',
            borderRadius: '12px',
            padding: '16px 20px',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <FaInfoCircle style={{ fontSize: '1.5rem', color: '#6C63FF' }} />
            <div style={{ flex: 1 }}>
              <p style={{ 
                margin: 0, 
                color: 'rgba(255, 255, 255, 0.9)', 
                fontSize: '0.95rem',
                lineHeight: '1.5'
              }}>
                <strong>Platform Fee Notice:</strong> A 1% platform fee will be deducted when creating escrows. 
                Service providers will also have a 1% fee deducted from final payments.
              </p>
            </div>
          </div>
          
          {/* Tabs */}
          <div style={{
            display: 'flex',
            gap: '20px',
            marginBottom: '30px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            paddingBottom: '15px'
          }}>
            <button
              onClick={() => setActiveTab('active')}
              style={{
                background: 'none',
                border: 'none',
                color: activeTab === 'active' ? '#fff' : 'rgba(255, 255, 255, 0.6)',
                fontSize: '1.1rem',
                fontWeight: activeTab === 'active' ? '600' : '400',
                cursor: 'pointer',
                paddingBottom: '10px',
                borderBottom: activeTab === 'active' ? '2px solid #6C63FF' : 'none',
                transition: 'all 0.3s ease'
              }}
            >
              Active Jobs
            </button>
            <button
              onClick={() => setActiveTab('history')}
              style={{
                background: 'none',
                border: 'none',
                color: activeTab === 'history' ? '#fff' : 'rgba(255, 255, 255, 0.6)',
                fontSize: '1.1rem',
                fontWeight: activeTab === 'history' ? '600' : '400',
                cursor: 'pointer',
                paddingBottom: '10px',
                borderBottom: activeTab === 'history' ? '2px solid #6C63FF' : 'none',
                transition: 'all 0.3s ease'
              }}
            >
              History
            </button>
            
            {/* Refresh Button */}
            <button
              onClick={() => {
                setLoading(true);
                setManualRefresh(prev => prev + 1);
              }}
              disabled={loading}
              style={{
                background: loading ? 'rgba(108, 99, 255, 0.1)' : 'rgba(108, 99, 255, 0.2)',
                border: '1px solid rgba(108, 99, 255, 0.5)',
                borderRadius: '8px',
                color: loading ? 'rgba(255, 255, 255, 0.5)' : '#fff',
                padding: '8px 16px',
                fontSize: '0.9rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
                marginLeft: 'auto'
              }}
              onMouseOver={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = 'rgba(108, 99, 255, 0.3)';
                }
              }}
              onMouseOut={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = 'rgba(108, 99, 255, 0.2)';
                }
              }}
            >
              {loading ? (
                <><FaHourglassHalf style={{ marginRight: '8px' }} /> Loading...</>
              ) : (
                <><FaSync style={{ marginRight: '8px' }} /> Refresh</>
              )}
            </button>
          </div>

          {/* Jobs Table */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '12px',
            backdropFilter: 'blur(10px)',
            overflow: 'hidden'
          }}>
            {escrowJobs.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  minWidth: '600px'
                }}>
                  <thead>
                    <tr style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)'
                    }}>
                      <th style={{
                        padding: '15px 20px',
                        textAlign: 'left',
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '0.9rem',
                        fontWeight: '600'
                      }}>Job ID</th>
                      <th style={{
                        padding: '15px 20px',
                        textAlign: 'left',
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '0.9rem',
                        fontWeight: '600'
                      }}>Vendor</th>
                      <th style={{
                        padding: '15px 20px',
                        textAlign: 'left',
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '0.9rem',
                        fontWeight: '600'
                      }}>Original</th>
                      <th style={{
                        padding: '15px 20px',
                        textAlign: 'left',
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '0.9rem',
                        fontWeight: '600'
                      }}>Balance</th>
                      <th style={{
                        padding: '15px 20px',
                        textAlign: 'left',
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '0.9rem',
                        fontWeight: '600'
                      }}>Paid</th>
                      <th style={{
                        padding: '15px 20px',
                        textAlign: 'left',
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '0.9rem',
                        fontWeight: '600'
                      }}>Status</th>
                      <th style={{
                        padding: '15px 20px',
                        textAlign: 'left',
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '0.9rem',
                        fontWeight: '600'
                      }}>Deadline</th>
                      <th style={{
                        padding: '15px 20px',
                        textAlign: 'center',
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '0.9rem',
                        fontWeight: '600'
                      }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobs.map((job, index) => (
                      <tr
                        key={job.id}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                          transition: 'all 0.3s ease',
                          animation: `fadeIn 0.5s ease ${index * 0.05}s both`,
                          position: 'relative'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(108, 99, 255, 0.08)';
                          e.currentTarget.style.transform = 'scale(1.01)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                      >
                        <td style={{
                          padding: '18px 20px',
                          color: '#fff',
                          fontSize: '0.95rem',
                          fontWeight: '600'
                        }}>
                          <span style={{
                            background: 'linear-gradient(135deg, #6C63FF 0%, #5753d1 100%)',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.9rem'
                          }}>
                            #{job.id}
                          </span>
                        </td>
                        <td style={{
                          padding: '18px 20px',
                          color: 'rgba(255, 255, 255, 0.9)',
                          fontSize: '0.95rem',
                          fontFamily: 'monospace'
                        }}>{formatAddress(job.vendor)}</td>
                        <td style={{
                          padding: '18px 20px',
                          color: '#fff',
                          fontSize: '0.95rem',
                          fontWeight: '600'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <FaMoneyBillWave style={{ fontSize: '1.1rem', color: '#4CAF50' }} />
                            {job.originalAmount}
                          </div>
                        </td>
                        <td style={{
                          padding: '18px 20px',
                          fontSize: '0.95rem',
                          fontWeight: '600'
                        }}>
                          <div style={{ 
                            display: 'inline-block',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.2) 0%, rgba(108, 99, 255, 0.1) 100%)',
                            border: '1px solid rgba(108, 99, 255, 0.3)',
                            color: '#6C63FF'
                          }}>
                            {job.escrowBalance}
                          </div>
                        </td>
                        <td style={{
                          padding: '18px 20px',
                          fontSize: '0.95rem',
                          fontWeight: '600'
                        }}>
                          <div style={{ 
                            display: 'inline-block',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.2) 0%, rgba(76, 175, 80, 0.1) 100%)',
                            border: '1px solid rgba(76, 175, 80, 0.3)',
                            color: '#4CAF50'
                          }}>
                            {job.paidAmount}
                          </div>
                        </td>
                        <td style={{
                          padding: '18px 20px'
                        }}>
                          <span style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            display: 'inline-block',
                            ...getStatusColor(job.status),
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                          }}>
                            {job.status}
                          </span>
                        </td>
                        <td style={{
                          padding: '18px 20px',
                          color: 'rgba(255, 255, 255, 0.8)',
                          fontSize: '0.95rem'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <FaClock style={{ fontSize: '1.1rem', color: '#FF9800' }} />
                            {job.deadline}
                          </div>
                        </td>
                        <td style={{
                          padding: '18px 20px',
                          textAlign: 'center'
                        }}>
                          <button
                            onClick={() => handleViewDetails(job)}
                            style={{
                              padding: '10px 20px',
                              borderRadius: '8px',
                              border: 'none',
                              background: 'linear-gradient(135deg, #6C63FF 0%, #5753d1 100%)',
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              fontWeight: '600',
                              transition: 'all 0.3s ease',
                              boxShadow: '0 4px 12px rgba(108, 99, 255, 0.3)'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.transform = 'translateY(-2px)';
                              e.currentTarget.style.boxShadow = '0 6px 16px rgba(108, 99, 255, 0.4)';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(108, 99, 255, 0.3)';
                            }}
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                color: 'rgba(255, 255, 255, 0.6)'
              }}>
                {loading ? (
                  <div>
                    <p style={{ fontSize: '1.1rem' }}>Loading escrow jobs...</p>
                    <p style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.4)' }}>Please wait while we fetch data from the blockchain</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: '1.1rem' }}>
                      {activeTab === 'active' ? 'No active jobs' : 'No completed jobs in history'}
                    </p>
                    <p style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.4)', marginTop: '10px' }}>
                      Account: {account ? `${account.substring(0, 10)}...${account.substring(account.length - 8)}` : 'Not connected'}
                    </p>
                    <p style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.4)' }}>
                      {activeTab === 'active' 
                        ? 'No active escrows found. Start by creating a new escrow from the Browse Vendors page.'
                        : 'No completed jobs yet. Completed and released jobs will appear here.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Summary Stats */}
          {escrowJobs.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px',
              marginTop: '30px'
            }}>
              {[
                { label: 'Total Escrow', value: escrowJobs.length, color: '#6C63FF' },
                { label: 'Active Jobs', value: escrowJobs.filter(j => j.status === 'InProgress').length, color: '#FFA500' },
                { label: 'Completed', value: escrowJobs.filter(j => j.status === 'Completed' || j.status === 'Released').length, color: '#4CAF50' }
              ].map((stat, idx) => (
                <div key={idx} style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '12px',
                  padding: '20px',
                  textAlign: 'center',
                  backdropFilter: 'blur(10px)'
                }}>
                  <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem', marginBottom: '8px' }}>
                    {stat.label}
                  </div>
                  <div style={{ color: stat.color, fontSize: '1.8rem', fontWeight: '600' }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
      
      {/* Notification Popup - Bottom Right */}
      <div style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        zIndex: 9999,
        maxWidth: '400px'
      }}>
        {notifications.map(notification => (
          <div
            key={notification.id}
            style={{
              background: 'rgba(108, 99, 255, 0.95)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '12px',
              padding: '16px 20px',
              color: '#fff',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              animation: 'slideInRight 0.3s ease-out',
              position: 'relative',
              display: 'flex',
              alignItems: 'start',
              gap: '12px'
            }}
          >
            <div style={{ flex: 1, fontSize: '0.95rem', lineHeight: '1.4' }}>
              {notification.message}
            </div>
            <button
              onClick={() => removeNotification(notification.id)}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: '0.9rem',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              }}
            >
              <FaTimes />
            </button>
          </div>
        ))}
      </div>

    </div>
  );
};

export default EscrowAndPayments;
