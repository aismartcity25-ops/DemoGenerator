import React from 'react';
import { useHospital } from '../../context/HospitalContext';
import { 
  HomeIcon, 
  CogIcon, 
  DocumentTextIcon, 
  ServerIcon, 
  ShieldCheckIcon,
  ChartBarIcon,
  PuzzlePieceIcon,
  WrenchIcon
} from '@heroicons/react/24/outline';

const navigation = [
  { name: 'Panoramica', href: '/overview', icon: HomeIcon },
  { name: 'Architettura', href: '/architecture', icon: DocumentTextIcon },
  { name: 'Installazione', href: '/installation', icon: WrenchIcon },
  { name: 'Integrazione EHR', href: '/ehr-integration', icon: ServerIcon },
  { name: 'Sistema CUP', href: '/cup-system', icon: PuzzlePieceIcon },
  { name: 'Sicurezza', href: '/security', icon: ShieldCheckIcon },
  { name: 'Performance', href: '/performance', icon: ChartBarIcon },
  { name: 'Monitoraggio', href: '/monitoring', icon: CogIcon },
];

export default function Sidebar({ open, onClose }) {
  const { hospitalType } = useHospital();

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div 
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 transition-opacity lg:hidden" 
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div 
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b">
          <h1 className="text-xl font-bold text-gray-900">Xperiments</h1>
          <span className="text-sm text-gray-500 capitalize">{hospitalType}</span>
        </div>

        <nav className="mt-6 px-4 space-y-1">
          {navigation.map((item) => (
            <a
              key={item.name}
              href={item.href}
              className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <item.icon className="h-5 w-5 mr-3 text-gray-400" />
              {item.name}
            </a>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t">
          <div className="text-xs text-gray-500">
            Versione: 1.0.0<br />
            Tipo: {hospitalType}
          </div>
        </div>
      </div>
    </>
  );
}