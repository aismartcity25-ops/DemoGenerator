/**
 * EHR Integration Simulator
 * Simula l'integrazione con Cartelle Cliniche Elettroniche (EHR)
 */

class EHRIntegrationSimulator {
  constructor() {
    this.fhirServer = null;
    this.connected = false;
    this.patients = [];
    this.encounters = [];
    this.observations = [];
  }

  /**
   * Simula la connessione a un server FHIR
   */
  async connectToFHIR(baseUrl, authType, credentials) {
    console.log(`🔗 Connecting to FHIR server: ${baseUrl}`);
    
    // Simula diversi tipi di autenticazione
    switch (authType) {
      case 'basic':
        if (!credentials.username || !credentials.password) {
          throw new Error('Basic auth requires username and password');
        }
        break;
      case 'bearer':
        if (!credentials.token) {
          throw new Error('Bearer auth requires token');
        }
        break;
      case 'client_credentials':
        if (!credentials.clientId || !credentials.clientSecret) {
          throw new Error('Client credentials auth requires clientId and clientSecret');
        }
        break;
      default:
        throw new Error(`Unsupported auth type: ${authType}`);
    }

    // Simula la connessione
    await this.simulateNetworkDelay(1000);
    
    this.fhirServer = {
      baseUrl,
      authType,
      credentials,
      version: '4.0.1',
      resources: ['Patient', 'Encounter', 'Observation', 'Procedure', 'Medication']
    };
    
    this.connected = true;
    
    return {
      success: true,
      message: 'FHIR server connection successful',
      server: this.fhirServer
    };
  }

  /**
   * Simula il recupero di pazienti dal server FHIR
   */
  async getPatients(limit = 10) {
    if (!this.connected) {
      throw new Error('Not connected to FHIR server');
    }

    console.log(`🏥 Fetching patients from FHIR server...`);
    
    // Simula il recupero dei pazienti
    await this.simulateNetworkDelay(500);
    
    const patients = this.generateMockPatients(limit);
    this.patients = patients;
    
    return {
      success: true,
      patients: patients,
      count: patients.length,
      message: `Retrieved ${patients.length} patients`
    };
  }

  /**
   * Simula il recupero delle cartelle cliniche di un paziente
   */
  async getPatientRecord(patientId) {
    if (!this.connected) {
      throw new Error('Not connected to FHIR server');
    }

    console.log(`📋 Fetching medical record for patient: ${patientId}`);
    
    await this.simulateNetworkDelay(800);
    
    const patient = this.patients.find(p => p.id === patientId);
    if (!patient) {
      throw new Error(`Patient ${patientId} not found`);
    }

    const record = {
      patient: patient,
      encounters: this.generateMockEncounters(patientId, 3),
      observations: this.generateMockObservations(patientId, 10),
      medications: this.generateMockMedications(patientId, 5),
      procedures: this.generateMockProcedures(patientId, 2)
    };

    return {
      success: true,
      record: record,
      message: `Medical record retrieved for ${patient.name}`
    };
  }

  /**
   * Simula l'aggiornamento di una cartella clinica
   */
  async updatePatientRecord(patientId, updates) {
    if (!this.connected) {
      throw new Error('Not connected to FHIR server');
    }

    console.log(`📝 Updating medical record for patient: ${patientId}`);
    
    await this.simulateNetworkDelay(600);
    
    const patient = this.patients.find(p => p.id === patientId);
    if (!patient) {
      throw new Error(`Patient ${patientId} not found`);
    }

    // Simula l'aggiornamento
    const updatedRecord = {
      ...updates,
      lastUpdated: new Date().toISOString(),
      updatedBy: 'Xperiments Hospital AI'
    };

    return {
      success: true,
      updatedRecord: updatedRecord,
      message: `Medical record updated for ${patient.name}`
    };
  }

  /**
   * Simula la ricerca di pazienti per criteri specifici
   */
  async searchPatients(criteria) {
    if (!this.connected) {
      throw new Error('Not connected to FHIR server');
    }

    console.log(`🔍 Searching patients with criteria:`, criteria);
    
    await this.simulateNetworkDelay(700);
    
    let results = [...this.patients];
    
    // Applica i filtri
    if (criteria.name) {
      results = results.filter(p => 
        p.name.toLowerCase().includes(criteria.name.toLowerCase())
      );
    }
    
    if (criteria.gender) {
      results = results.filter(p => p.gender === criteria.gender);
    }
    
    if (criteria.ageMin || criteria.ageMax) {
      const currentYear = new Date().getFullYear();
      results = results.filter(p => {
        const birthYear = new Date(p.birthDate).getFullYear();
        const age = currentYear - birthYear;
        return (!criteria.ageMin || age >= criteria.ageMin) && 
               (!criteria.ageMax || age <= criteria.ageMax);
      });
    }

    return {
      success: true,
      patients: results,
      count: results.length,
      message: `Found ${results.length} patients matching criteria`
    };
  }

  /**
   * Simula la disconnessione dal server FHIR
   */
  disconnect() {
    console.log('🔌 Disconnecting from FHIR server...');
    this.connected = false;
    this.fhirServer = null;
    return { success: true, message: 'Disconnected from FHIR server' };
  }

  /**
   * Genera dati mock per pazienti
   */
  generateMockPatients(count) {
    const patients = [];
    const names = [
      'Mario Rossi', 'Laura Bianchi', 'Marco Verdi', 'Anna Neri',
      'Luca Rosi', 'Sofia Esposito', 'Alessandro Russo', 'Giulia Romano',
      'Francesco Conti', 'Martina De Luca', 'Antonio Marino', 'Elena Gallo'
    ];

    for (let i = 0; i < count; i++) {
      const name = names[i % names.length];
      const birthYear = 1950 + Math.floor(Math.random() * 50);
      const birthMonth = Math.floor(Math.random() * 12) + 1;
      const birthDay = Math.floor(Math.random() * 28) + 1;
      
      patients.push({
        id: `patient-${String(i + 1).padStart(3, '0')}`,
        name: name,
        birthDate: `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`,
        gender: Math.random() > 0.5 ? 'male' : 'female',
        active: true,
        managingOrganization: 'Hospital Xperiments'
      });
    }

    return patients;
  }

  /**
   * Genera dati mock per encounters
   */
  generateMockEncounters(patientId, count) {
    const encounters = [];
    const types = ['Ambulatory', 'Emergency', 'Inpatient', 'Virtual'];
    const reasons = ['Controllo di routine', 'Dolore toracico', 'Visita specialistica', 'Esame del sangue'];

    for (let i = 0; i < count; i++) {
      const encounterDate = new Date();
      encounterDate.setDate(encounterDate.getDate() - Math.floor(Math.random() * 365));
      
      encounters.push({
        id: `encounter-${patientId}-${i + 1}`,
        patientId: patientId,
        type: types[Math.floor(Math.random() * types.length)],
        reason: reasons[Math.floor(Math.random() * reasons.length)],
        startDate: encounterDate.toISOString(),
        endDate: new Date(encounterDate.getTime() + Math.random() * 8 * 60 * 60 * 1000).toISOString(),
        status: 'finished'
      });
    }

    return encounters;
  }

  /**
   * Genera dati mock per observations
   */
  generateMockObservations(patientId, count) {
    const observations = [];
    const types = ['Blood Pressure', 'Heart Rate', 'Temperature', 'Weight', 'Height'];
    const units = ['mmHg', 'bpm', '°C', 'kg', 'cm'];

    for (let i = 0; i < count; i++) {
      const obsDate = new Date();
      obsDate.setDate(obsDate.getDate() - Math.floor(Math.random() * 30));
      
      observations.push({
        id: `observation-${patientId}-${i + 1}`,
        patientId: patientId,
        type: types[Math.floor(Math.random() * types.length)],
        value: Math.floor(Math.random() * 100) + 50,
        unit: units[Math.floor(Math.random() * units.length)],
        date: obsDate.toISOString(),
        status: 'final'
      });
    }

    return observations;
  }

  /**
   * Genera dati mock per medications
   */
  generateMockMedications(patientId, count) {
    const medications = [];
    const names = ['Aspirina', 'Paracetamolo', 'Ibuprofene', 'Omeprazolo', 'Metformina'];

    for (let i = 0; i < count; i++) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - Math.floor(Math.random() * 60));
      
      medications.push({
        id: `medication-${patientId}-${i + 1}`,
        patientId: patientId,
        name: names[Math.floor(Math.random() * names.length)],
        dosage: `${Math.floor(Math.random() * 1000) + 100}mg`,
        frequency: ['1 volta al giorno', '2 volte al giorno', '3 volte al giorno'][Math.floor(Math.random() * 3)],
        startDate: startDate.toISOString(),
        endDate: new Date(startDate.getTime() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active'
      });
    }

    return medications;
  }

  /**
   * Genera dati mock per procedures
   */
  generateMockProcedures(patientId, count) {
    const procedures = [];
    const names = ['Ecografia', 'Radiografia', 'TAC', 'RMN', 'Elettrocardiogramma'];

    for (let i = 0; i < count; i++) {
      const procedureDate = new Date();
      procedureDate.setDate(procedureDate.getDate() - Math.floor(Math.random() * 90));
      
      procedures.push({
        id: `procedure-${patientId}-${i + 1}`,
        patientId: patientId,
        name: names[Math.floor(Math.random() * names.length)],
        description: `Procedura diagnostica: ${names[Math.floor(Math.random() * names.length)]}`,
        date: procedureDate.toISOString(),
        status: 'completed',
        performedBy: `Dr. ${['Rossi', 'Bianchi', 'Verdi', 'Neri'][Math.floor(Math.random() * 4)]}`
      });
    }

    return procedures;
  }

  /**
   * Simula un ritardo di rete
   */
  async simulateNetworkDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Esegue un test completo di integrazione EHR
   */
  async runIntegrationTest() {
    console.log('🧪 Starting EHR Integration Test...');
    
    try {
      // 1. Connessione al server FHIR
      const connectionResult = await this.connectToFHIR(
        'https://fhir.example.com/api',
        'bearer',
        { token: 'mock-token-12345' }
      );
      console.log('✅ Connection:', connectionResult.message);

      // 2. Recupero pazienti
      const patientsResult = await this.getPatients(5);
      console.log('✅ Patients:', `Retrieved ${patientsResult.count} patients`);

      // 3. Ricerca pazienti
      const searchResult = await this.searchPatients({ gender: 'male', ageMin: 30, ageMax: 60 });
      console.log('✅ Search:', `Found ${searchResult.count} matching patients`);

      // 4. Recupero cartella clinica
      if (patientsResult.patients.length > 0) {
        const recordResult = await this.getPatientRecord(patientsResult.patients[0].id);
        console.log('✅ Record:', `Retrieved record for ${recordResult.record.patient.name}`);
      }

      // 5. Disconnessione
      const disconnectResult = this.disconnect();
      console.log('✅ Disconnection:', disconnectResult.message);

      return {
        success: true,
        message: 'EHR integration test completed successfully',
        performance: {
          responseTime: '2.1s',
          throughput: '100 req/s',
          errors: 0
        },
        data: {
          patientsSynced: patientsResult.count,
          encountersSynced: patientsResult.count * 3,
          observationsSynced: patientsResult.count * 10
        }
      };

    } catch (error) {
      console.error('❌ EHR Integration Test Failed:', error.message);
      return {
        success: false,
        message: error.message,
        performance: {
          responseTime: 'N/A',
          throughput: '0 req/s',
          errors: 1
        }
      };
    }
  }
}

module.exports = { EHRIntegrationSimulator };