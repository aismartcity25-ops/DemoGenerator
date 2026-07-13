import React, { useState } from 'react';
import { useHospital } from '../../context/HospitalContext';
import Sidebar from './Sidebar';
import Header from './Header';

export default function DashboardLayout({ children }) {
  const { hospitalType } = useHospital();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar 
        open={sidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
      />
      
      {/* Header */}
      <Header 
        onMenuClick={() => setSidebarOpen(true)}
        hospitalType={hospitalType}
      />
      
      {/* Main Content */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}