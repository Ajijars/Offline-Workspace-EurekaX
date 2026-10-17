'use client';

import Link from 'next/link';
import { ArrowRight, Shield, Users, Zap, Database, Sparkles, BarChart, Lock, Code } from 'lucide-react';
import AmbientBackground from '@/components/layout/AmbientBackground';

export default function LandingPage() {
  return (
    <div className="landing-page">
      <AmbientBackground />
      
      <div className="landing-container">
        <header className="landing-header">
          <div className="landing-logo">
            <Sparkles size={24} className="landing-logo-icon" />
            <span className="landing-logo-text">EurekaX</span>
          </div>
          <div className="landing-nav">
            <Link href="https://github.com/Ajijars/EurekaX_Offline_Industry_Workspace" target="_blank" className="landing-nav-link">Documentation</Link>
          </div>
        </header>

        <main className="landing-main">
          <div className="landing-hero">
            <div className="landing-badge">
              <span className="landing-badge-dot"></span>
              Enterprise Data Platform v4.0
            </div>
            <h1 className="landing-title">
              Unified AI Workspace for<br />
              <span className="landing-gradient-text">Modern Data Teams</span>
            </h1>
            <p className="landing-subtitle">
              Databricks-inspired intelligence. Complete role-based governance. <br />
              Seamlessly query databases, manage pipelines, and collaborate with AI.
            </p>

            <div className="landing-actions">
              <Link href="/login?role=admin" className="landing-btn landing-btn-primary">
                <Shield size={18} />
                <span>Admin Portal</span>
                <ArrowRight size={16} />
              </Link>
              <Link href="/login?role=employee" className="landing-btn landing-btn-secondary">
                <Users size={18} />
                <span>Employee Portal</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>

          <div className="landing-features">
            <div className="landing-feature-card">
              <div className="landing-feature-icon-wrap" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa' }}>
                <Database size={24} />
              </div>
              <h3>Data Governance</h3>
              <p>Granular access control, comprehensive cataloging, and complete query lineage tracking.</p>
            </div>
            
            <div className="landing-feature-card">
              <div className="landing-feature-icon-wrap" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa' }}>
                <Code size={24} />
              </div>
              <h3>ETL Pipelines</h3>
              <p>Build, schedule, and monitor robust data transformation workflows with native SQL & Python support.</p>
            </div>

            <div className="landing-feature-card">
              <div className="landing-feature-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399' }}>
                <Lock size={24} />
              </div>
              <h3>AI Security</h3>
              <p>Real-time guardrails, PII redaction, and anomaly detection for safe enterprise AI usage.</p>
            </div>
          </div>
        </main>
      </div>

      <style jsx>{`
        .landing-page {
          height: 100vh;
          width: 100%;
          position: relative;
          color: white;
          overflow-x: hidden;
          overflow-y: auto;
          font-family: var(--font-inter), sans-serif;
        }

        .landing-container {
          position: relative;
          z-index: 10;
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 24px;
          display: flex;
          flex-direction: column;
          min-height: 100vh;
        }

        .landing-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 32px 0;
        }

        .landing-logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .landing-logo-icon {
          color: #a78bfa;
        }

        .landing-logo-text {
          font-size: 1.25rem;
          font-weight: 700;
          letter-spacing: -0.02em;
        }

        .landing-nav-link {
          color: var(--text-2);
          text-decoration: none;
          font-size: 0.9rem;
          transition: color 0.2s;
        }

        .landing-nav-link:hover {
          color: white;
        }

        .landing-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding-top: 64px;
          padding-bottom: 64px;
        }

        .landing-hero {
          text-align: center;
          max-width: 800px;
          margin-bottom: 80px;
        }

        .landing-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 6px 16px;
          border-radius: 99px;
          font-size: 0.85rem;
          color: var(--text-2);
          margin-bottom: 32px;
        }

        .landing-badge-dot {
          width: 8px;
          height: 8px;
          background: #34d399;
          border-radius: 50%;
          box-shadow: 0 0 10px rgba(52, 211, 153, 0.5);
        }

        .landing-title {
          font-size: 4.5rem;
          font-weight: 800;
          line-height: 1.1;
          letter-spacing: -0.04em;
          margin-bottom: 24px;
        }

        .landing-gradient-text {
          background: linear-gradient(135deg, #a78bfa 0%, #3b82f6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .landing-subtitle {
          font-size: 1.25rem;
          color: var(--text-2);
          line-height: 1.6;
          margin-bottom: 48px;
          max-width: 600px;
          margin-left: auto;
          margin-right: auto;
        }

        .landing-actions {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 20px;
        }

        .landing-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 32px;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 500;
          text-decoration: none;
          transition: all 0.2s ease;
        }

        .landing-btn-primary {
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.8) 0%, rgba(59, 130, 246, 0.8) 100%);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 8px 32px rgba(124, 58, 237, 0.3);
        }

        .landing-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(124, 58, 237, 0.4);
        }

        .landing-btn-secondary {
          background: rgba(255, 255, 255, 0.05);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
        }

        .landing-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.1);
          transform: translateY(-2px);
        }

        .landing-features {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
          width: 100%;
        }

        .landing-feature-card {
          background: rgba(15, 23, 42, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 32px;
          border-radius: 16px;
          backdrop-filter: blur(10px);
          transition: transform 0.2s, background 0.2s;
        }

        .landing-feature-card:hover {
          background: rgba(15, 23, 42, 0.6);
          transform: translateY(-4px);
        }

        .landing-feature-icon-wrap {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
        }

        .landing-feature-card h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 12px;
          color: white;
        }

        .landing-feature-card p {
          color: var(--text-2);
          font-size: 0.95rem;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
