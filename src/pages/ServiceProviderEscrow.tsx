import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import VantaBackground from '../components/VantaBackground';
import WalletButton from '../components/WalletButton';
import { getProvider } from '../utils/nft';
import { ESCROW_ABI, ESCROW_CONTRACT_ADDRESS, getJobStatusFromNumber } from '../utils/escrow';
import { FaCheckCircle, FaMoneyBillWave, FaTimes, FaHourglassHalf, FaRocket, FaClipboardCheck, FaFileAlt, FaSync } from 'react-icons/fa';

interface EscrowJob {
  id: string;
  organizer: string;
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

interface ServiceProviderEscrowProps {
  account: string;
  onBack: () => void;
  refreshTrigger?: number;
}

const ServiceProviderEscrow: React.FC<ServiceProviderEscrowProps> = ({ account, onBack, refreshTrigger = 0 }) => {
  const [escrowJobs, setEscrowJobs] = useState<EscrowJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [manualRefresh, setManualRefresh] = useState(0);
  const [selectedJob, setSelectedJob] = useState<EscrowJob | null>(null);
  const [showJobDetails, setShowJobDetails] = useState(false);
  const [startJobProofUrl, setStartJobProofUrl] = useState('');
  const [showStartJobDialog, setShowStartJobDialog] = useState(false);
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
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  // Remove notification manually
  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Fetch escrow jobs from contract where user is the VENDOR
  useEffect(() => {
    
    const fetchEscrowJobs = async () => {
      try {
        setLoading(true);
        console.log('Starting to fetch escrow jobs for vendor:', account);
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
        
        console.log(`Fetching ${totalEscrowsNum} escrow(s) to find vendor jobs...`);
        for (let i = 0; i < totalEscrowsNum; i++) {
          try {
            console.log(`Fetching escrow ${i}...`);
            const escrow = await contract.getEscrow(i);
            console.log(`Escrow ${i}:`, {
              vendor: escrow.vendor,
              organizer: escrow.organizer,
              status: escrow.status.toString(),
              originalAmount: escrow.originalAmount.toString(),
              escrowBalance: escrow.escrowBalance.toString()
            });
            
            // Only show escrows where current account is the VENDOR
            if (escrow.vendor.toLowerCase() === account.toLowerCase()) {
              // Calculate paid amount
              const originalAmountBigInt = escrow.originalAmount;
              const escrowBalanceBigInt = escrow.escrowBalance;
              const paidAmountBigInt = originalAmountBigInt - escrowBalanceBigInt;
              
              const tokenSymbol = escrow.tokenAddress === ethers.ZeroAddress ? 'MON' : 'Token';
              
              const job: EscrowJob = {
                id: escrow.id.toString(),
                organizer: formatAddress(escrow.organizer),
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
              console.log('Added job for vendor:', job.id);
            }
          } catch (err) {
            console.error(`Could not fetch escrow ${i}:`, err);
          }
        }
        
        console.log('Fetched vendor jobs:', jobs);
        
        // Check for new funded escrows and notify
        const prevJobIds = escrowJobs.map(j => j.id);
        const newJobs = jobs.filter(j => !prevJobIds.includes(j.id) && j.status === 'Funded');
        
        if (newJobs.length > 0 && escrowJobs.length > 0) {
          newJobs.forEach(job => {
            addNotification(`New job order! Job #${job.id} - ${job.originalAmount} has been assigned to you`);
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
      default:
        return { bg: 'rgba(255, 255, 255, 0.1)', text: '#fff' };
    }
  };

  // Keep jobs in active until fully paid (Released status)
  const activeJobs = escrowJobs.filter(j => j.status === 'Funded' || j.status === 'InProgress' || j.status === 'Completed');
  const completedJobs = escrowJobs.filter(j => j.status === 'Released' || j.status === 'Refunded');
  const jobsToDisplay = activeTab === 'active' ? activeJobs : completedJobs;

  // Vendor Actions
  const handleStartJob = async (jobId: string, proofUrl: string) => {
    if (!proofUrl.trim()) {
      alert('Please provide a proof URL');
      return;
    }

    try {
      setActionLoading(true);
      const provider = getProvider();
      if (!provider) throw new Error('Provider not available');

      const signer = await provider.getSigner(account);
      const signerAddress = await signer.getAddress();
      if (signerAddress.toLowerCase() !== account.toLowerCase()) {
        throw new Error('The selected wallet changed. Refresh the job list and try again with the assigned service-provider wallet.');
      }

      const contract = new ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, signer);
      const escrow = await contract.getEscrow(jobId);
      if (escrow.vendor.toLowerCase() !== signerAddress.toLowerCase()) {
        throw new Error(`This job is assigned to ${escrow.vendor}, but the connected wallet is ${signerAddress}. Switch to the assigned service-provider wallet.`);
      }

      console.log('Starting job:', jobId, 'with proof:', proofUrl);
      const tx = await contract.startJob(jobId, proofUrl);
      alert('Starting job... Please wait for confirmation.');
      await tx.wait();

      alert('Job started successfully!');
      setShowStartJobDialog(false);
      setStartJobProofUrl('');
      setManualRefresh(prev => prev + 1);
    } catch (err: any) {
      console.error('Error starting job:', err);
      if (err.code === 'ACTION_REJECTED') {
        alert('Transaction was rejected');
      } else {
        alert('Failed to start job: ' + (err.message || 'Unknown error'));
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteJob = async (jobId: string) => {
    if (!window.confirm('Mark this job as completed? The organizer will then release payment.')) {
      return;
    }

    try {
      setActionLoading(true);
      const provider = getProvider();
      if (!provider) throw new Error('Provider not available');

      const signer = await provider.getSigner(account);
      const contract = new ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, signer);

      console.log('Completing job:', jobId);
      const tx = await contract.completeJob(jobId);
      alert('Completing job... Please wait for confirmation.');
      await tx.wait();

      alert('Job marked as completed! Waiting for organizer to release payment.');
      setShowJobDetails(false);
      setManualRefresh(prev => prev + 1);
    } catch (err: any) {
      console.error('Error completing job:', err);
      if (err.code === 'ACTION_REJECTED') {
        alert('Transaction was rejected');
      } else {
        alert('Failed to complete job: ' + (err.message || 'Unknown error'));
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="app">
      <VantaBackground />
      <div className="logo">MonConnect</div>

      <div style={{
        maxWidth: '1400px',
        margin: '80px auto 0',
        padding: '0 20px 30px'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '30px',
          flexWrap: 'wrap',
          gap: '20px'
        }}>
          <div>
            <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: '#fff' }}>
              My Job Payments
            </h1>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
              Track your assigned jobs and payment status
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {account && <WalletButton account={account} />}
            <button
              onClick={onBack}
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
              ← Back to Dashboard
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: '20px',
          marginBottom: '30px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          paddingBottom: '15px',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', gap: '20px' }}>
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
          </div>

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
              transition: 'all 0.3s ease'
            }}
          >
            {loading ? (
              <>
                <FaHourglassHalf style={{ marginRight: '8px' }} />
                Loading...
              </>
            ) : (
              <>
                <FaSync style={{ marginRight: '8px' }} />
                Refresh
              </>
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
          {jobsToDisplay.length > 0 ? (
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
                    }}>Organizer</th>
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
                      textAlign: 'center',
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
                    }}>Penalty</th>
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
                  {jobsToDisplay.map((job) => (
                    <tr
                      key={job.id}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                        transition: 'background-color 0.3s ease'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <td style={{
                        padding: '15px 20px',
                        color: '#fff',
                        fontSize: '0.95rem'
                      }}>#{job.id}</td>
                      <td style={{
                        padding: '15px 20px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        fontSize: '0.95rem'
                      }}>{job.organizer}</td>
                      <td style={{
                        padding: '15px 20px',
                        color: '#fff',
                        fontSize: '0.95rem',
                        fontWeight: '500'
                      }}>{job.originalAmount}</td>
                      <td style={{
                        padding: '15px 20px',
                        color: '#2196F3',
                        fontSize: '0.95rem',
                        fontWeight: '500'
                      }}>{job.escrowBalance}</td>
                      <td style={{
                        padding: '15px 20px',
                        color: '#4CAF50',
                        fontSize: '0.95rem',
                        fontWeight: '500'
                      }}>{job.paidAmount}</td>
                      <td style={{
                        padding: '15px 20px',
                        textAlign: 'center',
                        fontSize: '0.95rem'
                      }}>
                        <span style={{
                          background: getStatusColor(job.status).bg,
                          color: getStatusColor(job.status).text,
                          padding: '6px 12px',
                          borderRadius: '20px',
                          fontSize: '0.85rem',
                          fontWeight: '500'
                        }}>
                          {job.status}
                        </span>
                      </td>
                      <td style={{
                        padding: '15px 20px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        fontSize: '0.95rem'
                      }}>{job.deadline}</td>
                      <td style={{
                        padding: '15px 20px',
                        textAlign: 'center',
                        color: 'rgba(255, 255, 255, 0.8)',
                        fontSize: '0.95rem'
                      }}>{job.penaltyRate}</td>
                      <td style={{
                        padding: '15px 20px',
                        textAlign: 'center'
                      }}>
                        <button
                          onClick={() => {
                            setSelectedJob(job);
                            setShowJobDetails(true);
                          }}
                          style={{
                            background: 'rgba(108, 99, 255, 0.2)',
                            border: '1px solid rgba(108, 99, 255, 0.5)',
                            borderRadius: '6px',
                            color: '#fff',
                            padding: '6px 12px',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = 'rgba(108, 99, 255, 0.3)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = 'rgba(108, 99, 255, 0.2)';
                          }}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{
              padding: '60px 20px',
              textAlign: 'center'
            }}>
              {loading ? (
                <div>
                  <p style={{ fontSize: '1.1rem' }}>Loading jobs...</p>
                  <p style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.4)' }}>Please wait while we fetch data from the blockchain</p>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: '1.1rem', color: '#fff' }}>No jobs found</p>
                  <p style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.4)', marginTop: '10px' }}>
                    Account: {account ? `${account.substring(0, 10)}...${account.substring(account.length - 8)}` : 'Not connected'}
                  </p>
                  <p style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.4)' }}>
                    {activeTab === 'active' 
                      ? 'No active jobs assigned to you yet. Check back soon!'
                      : 'No completed jobs yet. Start taking on jobs to build your history!'}
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
              { label: 'Total Jobs', value: escrowJobs.length, color: '#6C63FF' },
              { label: 'Active Jobs', value: activeJobs.length, color: '#FFA500' },
              { label: 'Completed', value: completedJobs.length, color: '#4CAF50' }
            ].map((stat, idx) => (
              <div key={idx} style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '12px',
                padding: '20px',
                textAlign: 'center',
                backdropFilter: 'blur(10px)'
              }}>
                <div style={{
                  fontSize: '2.5rem',
                  fontWeight: 'bold',
                  color: stat.color,
                  marginBottom: '10px'
                }}>
                  {stat.value}
                </div>
                <div style={{
                  fontSize: '0.95rem',
                  color: 'rgba(255, 255, 255, 0.7)'
                }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Job Details Modal */}
      {showJobDetails && selectedJob && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(5px)'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(30, 30, 60, 0.95), rgba(60, 60, 120, 0.95))',
            borderRadius: '20px',
            padding: '35px',
            maxWidth: '800px',
            width: '95%',
            maxHeight: '90vh',
            overflowY: 'auto',
            border: '1px solid rgba(108, 99, 255, 0.4)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            animation: 'fadeIn 0.3s ease'
          }}>
            {/* Header */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '30px',
              paddingBottom: '20px',
              borderBottom: '2px solid rgba(108, 99, 255, 0.3)'
            }}>
              <h2 style={{ 
                color: '#fff', 
                margin: 0,
                fontSize: '1.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <FaFileAlt style={{ fontSize: '2rem', color: '#6C63FF' }} />
                Job Details
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
              <h3 style={{ 
                color: '#fff', 
                marginBottom: '20px', 
                fontSize: '1rem',
                fontWeight: '600',
                letterSpacing: '0.3px'
              }}>
                Progress Timeline
              </h3>
              <div style={{ position: 'relative' }}>
                {/* Progress line */}
                <div style={{
                  position: 'absolute',
                  top: '20px',
                  left: '20px',
                  right: '20px',
                  height: '3px',
                  background: 'linear-gradient(90deg, rgba(108, 99, 255, 0.3) 0%, rgba(108, 99, 255, 0.1) 100%)',
                  zIndex: 0
                }} />
                
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  position: 'relative',
                  zIndex: 1
                }}>
                  {[
                    { label: 'Funded', icon: <FaMoneyBillWave />, status: 'Funded' },
                    { label: 'In Progress', icon: <FaHourglassHalf />, status: 'InProgress' },
                    { label: 'Completed', icon: <FaClipboardCheck />, status: 'Completed' },
                    { label: 'Released', icon: <FaCheckCircle />, status: 'Released' }
                  ].map((step, idx) => {
                    const statusOrder = ['Funded', 'InProgress', 'Completed', 'Released'];
                    const currentIndex = statusOrder.indexOf(selectedJob.status);
                    const stepIndex = statusOrder.indexOf(step.status);
                    const isActive = stepIndex <= currentIndex;
                    const isCurrent = stepIndex === currentIndex;
                    
                    return (
                      <div key={idx} style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center',
                        flex: 1
                      }}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: isActive ? 'linear-gradient(135deg, #6C63FF 0%, #5753d1 100%)' : 'rgba(255, 255, 255, 0.1)',
                          border: isActive ? '3px solid rgba(108, 99, 255, 0.5)' : '3px solid rgba(255, 255, 255, 0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.3rem',
                          marginBottom: '10px',
                          boxShadow: isActive ? '0 4px 12px rgba(108, 99, 255, 0.4)' : 'none',
                          animation: isCurrent ? 'pulse 2s infinite' : 'none'
                        }}>
                          {step.icon}
                        </div>
                        <div style={{
                          color: isActive ? '#fff' : 'rgba(255, 255, 255, 0.4)',
                          fontSize: '0.85rem',
                          fontWeight: isActive ? '600' : '400',
                          textAlign: 'center'
                        }}>
                          {step.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Job Information Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px',
              marginBottom: '30px'
            }}>
              {[
                { label: 'Job ID', value: `#${selectedJob.id}`, gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
                { label: 'Organizer', value: selectedJob.organizer, gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
                { label: 'Original Amount', value: selectedJob.originalAmount, gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
                { label: 'Current Balance', value: selectedJob.escrowBalance, gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
                { label: 'Paid Amount', value: selectedJob.paidAmount, gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
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
                    fontSize: item.label === 'Organizer' ? '0.9rem' : '1.15rem', 
                    fontWeight: '600',
                    wordBreak: item.label === 'Organizer' ? 'break-all' : 'normal',
                    letterSpacing: '0.3px',
                    lineHeight: '1.4'
                  }}>
                    {item.value}
                  </div>
                </div>
              ))}
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

            {/* Platform Fee Notice */}
            <div style={{
              background: 'rgba(108, 99, 255, 0.15)',
              border: '2px solid rgba(108, 99, 255, 0.4)',
              borderRadius: '14px',
              padding: '18px 22px',
              marginBottom: '25px',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              display: 'flex',
              alignItems: 'start',
              gap: '14px',
              boxShadow: '0 4px 16px rgba(108, 99, 255, 0.2)'
            }}>
              <FaMoneyBillWave style={{ fontSize: '1.5rem', marginTop: '2px', color: '#4CAF50' }} />
              <div style={{ flex: 1 }}>
                <p style={{ 
                  margin: 0, 
                  color: 'rgba(255, 255, 255, 0.95)', 
                  fontSize: '0.9rem',
                  lineHeight: '1.6',
                  fontWeight: '500'
                }}>
                  <strong style={{ color: '#fff' }}>Platform Fee:</strong> A 1% platform fee will be automatically deducted from your final payment when the organizer releases funds.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ 
              marginTop: '30px',
              paddingTop: '30px', 
              display: 'flex', 
              gap: '15px', 
              flexWrap: 'wrap',
              borderTop: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              {selectedJob.status === 'Funded' && (
                <button
                  onClick={() => {
                    setShowJobDetails(false);
                    setShowStartJobDialog(true);
                  }}
                  disabled={actionLoading}
                  style={{
                    flex: 1,
                    minWidth: '150px',
                    background: actionLoading ? 'rgba(108, 99, 255, 0.1)' : 'linear-gradient(135deg, #6C63FF 0%, #5753d1 100%)',
                    border: '2px solid transparent',
                    borderRadius: '12px',
                    color: '#fff',
                    padding: '14px 24px',
                    fontSize: '0.95rem',
                    fontWeight: '600',
                    letterSpacing: '0.5px',
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: actionLoading ? 'none' : '0 0 0 1px rgba(108, 99, 255, 0.3), 0 8px 24px rgba(108, 99, 255, 0.2)',
                    opacity: actionLoading ? 0.6 : 1
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
                  {actionLoading ? 'Processing...' : 'Start Job'}
                </button>
              )}
              
              {selectedJob.status === 'InProgress' && (
                <button
                  onClick={() => handleCompleteJob(selectedJob.id)}
                  disabled={actionLoading}
                  style={{
                    flex: 1,
                    minWidth: '150px',
                    background: actionLoading ? 'rgba(76, 175, 80, 0.1)' : 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
                    border: '2px solid transparent',
                    borderRadius: '12px',
                    color: '#fff',
                    padding: '14px 24px',
                    fontSize: '0.95rem',
                    fontWeight: '600',
                    letterSpacing: '0.5px',
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: actionLoading ? 'none' : '0 0 0 1px rgba(76, 175, 80, 0.3), 0 8px 24px rgba(76, 175, 80, 0.2)',
                    opacity: actionLoading ? 0.6 : 1
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
                  {actionLoading ? 'Processing...' : 'Mark as Completed'}
                </button>
              )}

              <button
                onClick={() => setShowJobDetails(false)}
                style={{
                  flex: 1,
                  minWidth: '150px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '2px solid transparent',
                  borderRadius: '12px',
                  color: '#fff',
                  padding: '14px 24px',
                  fontSize: '0.95rem',
                  fontWeight: '600',
                  letterSpacing: '0.5px',
                  cursor: 'pointer',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  backdropFilter: 'blur(16px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(16px) saturate(180%)',
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
      )}

      {/* Start Job Dialog */}
      {showStartJobDialog && selectedJob && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001,
          backdropFilter: 'blur(5px)'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(50, 50, 100, 0.9), rgba(100, 99, 255, 0.1))',
            borderRadius: '16px',
            padding: '30px',
            maxWidth: '500px',
            width: '90%',
            border: '1px solid rgba(108, 99, 255, 0.3)',
            backdropFilter: 'blur(10px)'
          }}>
            <h2 style={{ color: '#fff', marginBottom: '20px' }}>Start Job #{selectedJob.id}</h2>
            <p style={{ color: 'rgba(255, 255, 255, 0.8)', marginBottom: '20px' }}>
              Provide a proof URL (e.g., link to your work plan, progress document, or initial deliverables) to start this job.
            </p>
            
            <label style={{ color: '#fff', display: 'block', marginBottom: '8px' }}>
              Proof URL <span style={{ color: '#ff6b6b' }}>*</span>
            </label>
            <input
              type="text"
              value={startJobProofUrl}
              onChange={(e) => setStartJobProofUrl(e.target.value)}
              placeholder="https://..."
              style={{
                width: '100%',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '1rem',
                marginBottom: '20px'
              }}
            />

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => handleStartJob(selectedJob.id, startJobProofUrl)}
                disabled={actionLoading || !startJobProofUrl.trim()}
                style={{
                  flex: 1,
                  background: actionLoading || !startJobProofUrl.trim() ? 'rgba(108, 99, 255, 0.1)' : '#6C63FF',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  padding: '12px',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: actionLoading || !startJobProofUrl.trim() ? 'not-allowed' : 'pointer'
                }}
              >
                {actionLoading ? (
                  <>
                    <FaHourglassHalf style={{ marginRight: '8px' }} />
                    Starting...
                  </>
                ) : (
                  <>
                    <FaRocket style={{ marginRight: '8px' }} />
                    Start Job
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setShowStartJobDialog(false);
                  setStartJobProofUrl('');
                }}
                disabled={actionLoading}
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: '#fff',
                  padding: '12px',
                  fontSize: '1rem',
                  cursor: actionLoading ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
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

export default ServiceProviderEscrow;
