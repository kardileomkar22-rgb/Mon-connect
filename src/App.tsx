import React from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import VantaBackground from './components/VantaBackground';
import OrganizerAuth from './pages/OrganizerAuth';
import ServiceAuth from './pages/ServiceAuth';
import Dashboard from './pages/Dashboard';
import OrganizerDashboard from './pages/OrganizerDashboard';
import ServiceProviderDashboard from './pages/ServiceProviderDashboard';
import NFTGuard from './components/NFTGuard';
import './styles/App.css';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [animating, setAnimating] = React.useState<"none" | "service" | "organizer">("none");

  // Trigger animation then navigate
  const handleSelect = (which: "service" | "organizer") => {
    setAnimating(which);
    // wait for the scale-out animation to finish before navigating
    setTimeout(() => {
      if (which === "service") navigate('/service-auth');
      else if (which === "organizer") navigate('/organizer-auth');
    }, 700); // matches CSS animation duration
  };

  return (
    <div className="app">
      <VantaBackground />
      <div className="logo">MonConnect</div>
      <div className="content-wrapper">
        <section className="hero">
          {/* card that will scale out when a button is clicked */}
          <div className={`hero-card ${animating !== 'none' ? 'scale-out' : ''}`}>
            <div className="hero-content">
              <h1>Organize. Collaborate. Contribute</h1>
              <div className="button-container">
                <button 
                  className="btn btn-primary"
                  onClick={() => handleSelect('service')}
                >
                  Start as Service Provider
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={() => handleSelect('organizer')}
                >
                  Join as Organizer
                </button>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="about">
          <div className="section-content">
            <h2 className="about-title">About Us</h2>
            <div className="about-divider"></div>
            <p className="about-text">
              MonConnect is your all-in-one platform for connecting event organizers with trusted service providers. Whether you need vendors for catering, 3D printing, co-working spaces, or community collaborations, we make it effortless to discover, verify, and collaborate for all in one place.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/organizer-auth" element={<OrganizerAuth />} />
        <Route path="/service-auth" element={<ServiceAuth />} />
        <Route path="/dashboard" element={<NFTGuard><Dashboard /></NFTGuard>} />
        <Route path="/organizer-dashboard" element={<NFTGuard requiredRole="organizer"><OrganizerDashboard /></NFTGuard>} />
        <Route path="/service-dashboard" element={<NFTGuard requiredRole="service-provider"><ServiceProviderDashboard /></NFTGuard>} />
      </Routes>
    </Router>
  );
};

export default App;
