import React from 'react';
import DashboardLayout from '../components/layout/DashboardLayout';
import { useHospital } from '../context/HospitalContext';

export default function Home() {
  const { hospitalType, setHospitalType } = useHospital();

  const modules = [
    {
      id: 'overview',
      title: 'Panoramica del Sistema',
      description: 'Introduzione al chatbot AI per ospedali e strutture sanitarie',
      icon: '🏥',
      color: 'bg-blue-500',
      progress: 0
    },
    {
      id: 'architecture',
      title: 'Architettura Tecnica',
      description: 'Dettagli sull\'architettura del sistema e i componenti principali',
      icon: '🏗️',
      color: 'bg-green-500',
      progress: 0
    },
    {
      id: 'installation',
      title: 'Installazione e Configurazione',
      description: 'Guida passo-passo per l\'installazione e configurazione del sistema',
      icon: '⚙️',
      color: 'bg-purple-500',
      progress: 0
    },
    {
      id: 'ehr-integration',
      title: 'Integrazione EHR',
      description: 'Connessione con Cartelle Cliniche Elettroniche e sistemi ospedalieri',
      icon: '🔗',
      color: 'bg-orange-500',
      progress: 0
    },
    {
      id: 'cup-system',
      title: 'Sistema CUP',
      description: 'Integrazione con sistemi di prenotazione e gestione appuntamenti',
      icon: '📅',
      color: 'bg-red-500',
      progress: 0
    },
    {
      id: 'security',
      title: 'Sicurezza e Conformità',
      description: 'Normative, sicurezza dei dati e conformità GDPR',
      icon: '🔒',
      color: 'bg-gray-500',
      progress: 0
    },
    {
      id: 'performance',
      title: 'Performance e Scalabilità',
      description: 'Ottimizzazione, caching e scalabilità del sistema',
      icon: '⚡',
      color: 'bg-yellow-500',
      progress: 0
    },
    {
      id: 'monitoring',
      title: 'Monitoraggio e Manutenzione',
      description: 'Strumenti di monitoraggio, manutenzione e troubleshooting',
      icon: '📊',
      color: 'bg-indigo-500',
      progress: 0
    }
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-hospital-primary to-hospital-secondary rounded-2xl p-8 text-white">
          <div className="max-w-4xl">
            <h1 className="text-4xl font-bold mb-4">
              Xperiments Hospital AI
            </h1>
            <p className="text-xl opacity-90 mb-6">
              Documentazione interattiva per l'implementazione di chatbot AI 
              in ospedali, cliniche, ASL, ASP, ASST e strutture sanitarie
            </p>
            <div className="flex flex-wrap gap-4">
              <button className="bg-white text-hospital-primary px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
                Inizia la Guida
              </button>
              <button className="border-2 border-white text-white px-6 py-3 rounded-lg font-semibold hover:bg-white hover:text-hospital-primary transition-colors">
                Simulatore
              </button>
            </div>
          </div>
        </div>

        {/* Hospital Type Selector */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Tipo di Struttura Sanitaria
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {['ospedale', 'clinica', 'asl', 'asp', 'asst', 'poliambulatorio'].map(type => (
              <button
                key={type}
                onClick={() => setHospitalType(type)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  hospitalType === type 
                    ? 'border-hospital-primary bg-hospital-primary/10' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="capitalize font-medium">{type}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {modules.map((module) => (
            <div key={module.id} className="bg-white rounded-xl p-6 shadow-sm border">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 ${module.color} rounded-lg flex items-center justify-center text-white text-xl`}>
                  {module.icon}
                </div>
                <span className="text-sm text-gray-500">0%</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{module.title}</h3>
              <p className="text-sm text-gray-600 mb-4">{module.description}</p>
              <button className="w-full btn-secondary">
                Apri Modulo
              </button>
            </div>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="text-2xl font-bold text-hospital-primary">24/7</div>
            <div className="text-sm text-gray-600">Disponibilità</div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="text-2xl font-bold text-hospital-accent">40%</div>
            <div className="text-sm text-gray-600">Riduzione chiamate</div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="text-2xl font-bold text-hospital-success">30%</div>
            <div className="text-sm text-gray-600">Miglioramento soddisfazione</div>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="text-2xl font-bold text-hospital-warning">2s</div>
            <div className="text-sm text-gray-600">Tempo risposta</div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}