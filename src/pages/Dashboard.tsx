import React from 'react';
import VantaBackground from '../components/VantaBackground';
import { FaCheckCircle, FaRocket, FaChartBar, FaUsers, FaPalette } from 'react-icons/fa';

const Dashboard: React.FC = () => {
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
        maxWidth: '800px', 
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
          Welcome to Your Dashboard!
        </h1>
        
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.1)', 
          padding: '2rem', 
          borderRadius: '12px',
          marginTop: '2rem',
          backdropFilter: 'blur(10px)'
        }}>
          <h2 style={{ 
            color: '#4CAF50', 
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px'
          }}>
            <FaCheckCircle />
            NFT Verified!
          </h2>
          <p style={{ fontSize: '1.1rem', lineHeight: '1.8', color: '#e0e0e0' }}>
            You successfully minted your NFT and gained access to this protected area.
          </p>
          
          <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(76, 175, 80, 0.2)', borderRadius: '8px' }}>
            <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>Your NFT Details</h3>
            <p style={{ color: '#e0e0e0' }}>
              <strong>Network:</strong> Monad Testnet (Chain ID: 10143)<br/>
              <strong>Status:</strong> Active ✓
            </p>
          </div>

          
        </div>

        <div style={{ marginTop: '2rem' }}>
          <button 
            className="btn btn-secondary"
            onClick={() => window.location.href = '/'}
            style={{ marginRight: '1rem' }}
          >
            ← Back to Home
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => alert('Dashboard features coming soon! This is where you would add your app functionality.')}
          >
            Explore Features
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
