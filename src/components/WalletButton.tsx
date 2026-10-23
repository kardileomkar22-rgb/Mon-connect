import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { ACTIVE_WALLET_KEY, getProvider } from '../utils/nft';
import { FaWallet, FaSignOutAlt } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

interface WalletButtonProps {
  account: string;
  onDisconnect?: () => void;
}

const WalletButton: React.FC<WalletButtonProps> = ({ account, onDisconnect }) => {
  const navigate = useNavigate();
  const [showPopup, setShowPopup] = useState(false);
  const [balance, setBalance] = useState<string>('0.00');
  const [loading, setLoading] = useState(false);

  const loadBalance = async () => {
    try {
      setLoading(true);
      const provider = getProvider();
      if (!provider) return;

      const balanceWei = await provider.getBalance(account);
      const balanceEth = ethers.formatEther(balanceWei);
      setBalance(parseFloat(balanceEth).toFixed(4));
    } catch (error) {
      console.error('Error loading balance:', error);
      setBalance('0.00');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (account && showPopup) {
      loadBalance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, showPopup]);

  const handleDisconnect = async () => {
    setShowPopup(false);
    sessionStorage.removeItem(ACTIVE_WALLET_KEY);

    try {
      await window.ethereum?.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }],
      });
    } catch (error) {
      console.info('Wallet permission revocation is unavailable; clearing the app session instead.', error);
    }

    if (onDisconnect) {
      onDisconnect();
    } else {
      navigate('/');
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Wallet Button */}
      <button
        onClick={() => setShowPopup(!showPopup)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 20px',
          background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.3) 0%, rgba(90, 82, 213, 0.3) 100%)',
          border: '2px solid rgba(108, 99, 255, 0.5)',
          borderRadius: '12px',
          color: '#fff',
          fontSize: '0.9rem',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          boxShadow: '0 4px 15px rgba(108, 99, 255, 0.2)'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(108, 99, 255, 0.5) 0%, rgba(90, 82, 213, 0.5) 100%)';
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 6px 20px rgba(108, 99, 255, 0.3)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(108, 99, 255, 0.3) 0%, rgba(90, 82, 213, 0.3) 100%)';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 4px 15px rgba(108, 99, 255, 0.2)';
        }}
      >
        <FaWallet style={{ fontSize: '1.2rem' }} />
        <span>{`${account.substring(0, 6)}...${account.substring(account.length - 4)}`}</span>
      </button>

      {/* Popup Modal */}
      {showPopup && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowPopup(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.3)',
              backdropFilter: 'blur(2px)',
              zIndex: 999
            }}
          />

          {/* Popup Content */}
          <div style={{
            position: 'absolute',
            top: '60px',
            right: 0,
            background: 'linear-gradient(135deg, rgba(30, 30, 60, 0.98) 0%, rgba(20, 20, 40, 0.98) 100%)',
            border: '2px solid rgba(108, 99, 255, 0.5)',
            borderRadius: '16px',
            padding: '25px',
            minWidth: '280px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            backdropFilter: 'blur(10px)'
          }}>
            {/* Header */}
            <div style={{
              marginBottom: '20px',
              paddingBottom: '15px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <h3 style={{
                margin: '0 0 10px 0',
                color: '#fff',
                fontSize: '1.1rem',
                fontWeight: '600'
              }}>
                Wallet Details
              </h3>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                fontSize: '0.85rem',
                color: 'rgba(255, 255, 255, 0.7)',
                wordBreak: 'break-all'
              }}>
                <FaWallet style={{ fontSize: '0.9rem', color: '#6C63FF' }} />
                {account}
              </div>
            </div>

            {/* Balance Display */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.2) 0%, rgba(90, 82, 213, 0.2) 100%)',
              border: '1px solid rgba(108, 99, 255, 0.3)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              <div style={{
                fontSize: '0.85rem',
                color: 'rgba(255, 255, 255, 0.6)',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                Balance
              </div>
              <div style={{
                fontSize: '2rem',
                fontWeight: '700',
                color: '#fff',
                marginBottom: '5px'
              }}>
                {loading ? '...' : balance}
              </div>
              <div style={{
                fontSize: '1rem',
                color: 'rgba(255, 255, 255, 0.7)',
                fontWeight: '600'
              }}>
                MON
              </div>
            </div>

            {/* Disconnect Button */}
            <button
              onClick={handleDisconnect}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '12px',
                background: 'rgba(255, 99, 99, 0.2)',
                border: '2px solid rgba(255, 99, 99, 0.5)',
                borderRadius: '10px',
                color: '#ff6363',
                fontSize: '0.95rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255, 99, 99, 0.3)';
                e.currentTarget.style.borderColor = 'rgba(255, 99, 99, 0.7)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(255, 99, 99, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(255, 99, 99, 0.5)';
              }}
            >
              <FaSignOutAlt />
              Disconnect Wallet
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default WalletButton;
