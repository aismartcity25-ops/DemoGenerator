import React from 'react';
import { useHospital } from '../../context/HospitalContext';
import { 
  Bars3Icon, 
  UserCircleIcon,
  Cog6ToothIcon,
  PlayIcon
} from '@heroicons/react/24/outline';

export default function Header({ onMenuClick, hospitalType }) {
  const { user } = useHospital();

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left side */}
          <div className="flex items-center">
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
            >
              <Bars3Icon className="h-6 w-6" />
            </button>
            
            <div className="ml-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Documentazione Interattiva
              </h2>
              <p className="text-sm text-gray-500 capitalize">
                {hospitalType} - Chatbot AI
              </p>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center space-x-4">
            {/* Simulator Button */}
            <button className="btn-primary flex items-center space-x-2">
              <PlayIcon className="h-4 w-4" />
              <span>Simulatore</span>
            </button>

            {/* Settings */}
            <button className="p-2 text-gray-400 hover:text-gray-500">
              <Cog6ToothIcon className="h-6 w-6" />
            </button>

            {/* User */}
            <div className="flex items-center space-x-3">
              <UserCircleIcon className="h-8 w-8 text-gray-400" />
              <div className="hidden md:block">
                <div className="text-sm font-medium text-gray-900">
                  {user?.name || 'Amministratore'}
                </div>
                <div className="text-xs text-gray-500">
                  {user?.role || hospitalType}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}