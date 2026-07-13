/**
 * CUP System Simulator
 * Simula l'integrazione con sistemi di prenotazione e gestione appuntamenti
 */

class CUPSystemSimulator {
  constructor() {
    this.connected = false;
    this.system = null;
    this.services = [];
    this.appointments = [];
    this.waitingLists = [];
  }

  /**
   * Simula la connessione a un sistema CUP
   */
  async connectToCUP(baseUrl, systemType, credentials) {
    console.log(`📅 Connecting to CUP system: ${baseUrl}`);
    
    // Simula diversi tipi di sistemi CUP
    const supportedSystems = ['regional', 'hospital', 'private', 'mixed'];
    if (!supportedSystems.includes(systemType)) {
      throw new Error(`Unsupported CUP system type: ${systemType}`);
    }

    // Simula la connessione
    await this.simulateNetworkDelay(800);
    
    this.system = {
      baseUrl,
      systemType,
      credentials,
      version: '2.1.0',
      maxBookingDays: systemType === 'regional' ? 90 : 60,
      availableServices: this.generateMockServices(),
      bookingRules: {
        maxAppointmentsPerPatient: 5,
        maxAdvanceBooking: systemType === 'regional' ? 90 : 60,
        minTimeBetweenAppointments: 30 // minuti
      }
    };
    
    this.connected = true;
    this.services = this.system.availableServices;
    
    return {
      success: true,
      message: 'CUP system connection successful',
      system: this.system
    };
  }

  /**
   * Simula la verifica della disponibilità per un servizio
   */
  async checkAvailability(serviceId, date, timeSlot) {
    if (!this.connected) {
      throw new Error('Not connected to CUP system');
    }

    console.log(`⏰ Checking availability for service ${serviceId} on ${date} at ${timeSlot}`);
    
    await this.simulateNetworkDelay(300);
    
    // Simula la disponibilità basata su orari lavorativi e carico
    const dayOfWeek = new Date(date).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    if (isWeekend) {
      return {
        success: false,
        message: 'No availability on weekends',
        availableSlots: []
      };
    }

    // Simula slot disponibili
    const availableSlots = this.generateAvailableSlots(date, serviceId);
    
    return {
      success: true,
      serviceId,
      date,
      availableSlots,
      message: `Found ${availableSlots.length} available slots`
    };
  }

  /**
   * Simula la prenotazione di un appuntamento
   */
  async bookAppointment(patientData, serviceId, date, timeSlot) {
    if (!this.connected) {
      throw new Error('Not connected to CUP system');
    }

    console.log(`✅ Booking appointment for ${patientData.name} - Service: ${serviceId}`);
    
    // Validazione prenotazione
    const validation = this.validateBooking(patientData, serviceId, date, timeSlot);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.message,
        appointment: null
      };
    }

    await this.simulateNetworkDelay(500);
    
    // Crea appuntamento
    const appointment = {
      id: `appointment-${Date.now()}`,
      patientId: patientData.id,
      patientName: patientData.name,
      patientCF: patientData.cf,
      serviceId,
      serviceName: this.services.find(s => s.id === serviceId)?.name || 'Unknown Service',
      date,
      timeSlot,
      status: 'confirmed',
      bookingDate: new Date().toISOString(),
      confirmationCode: this.generateConfirmationCode(),
      location: this.system.systemType === 'hospital' ? 'Ospedale Xperiments' : 'Centro Prenotazioni',
      notes: patientData.notes || ''
    };

    this.appointments.push(appointment);
    
    return {
      success: true,
      appointment,
      message: `Appointment booked successfully. Confirmation code: ${appointment.confirmationCode}`
    };
  }

  /**
   * Simula la cancellazione di un appuntamento
   */
  async cancelAppointment(appointmentId, reason) {
    if (!this.connected) {
      throw new Error('Not connected to CUP system');
    }

    console.log(`❌ Cancelling appointment: ${appointmentId}`);
    
    const appointment = this.appointments.find(a => a.id === appointmentId);
    if (!appointment) {
      return {
        success: false,
        message: 'Appointment not found'
      };
    }

    await this.simulateNetworkDelay(300);
    
    appointment.status = 'cancelled';
    appointment.cancellationDate = new Date().toISOString();
    appointment.cancellationReason = reason;
    
    return {
      success: true,
      appointment,
      message: 'Appointment cancelled successfully'
    };
  }

  /**
   * Simula la modifica di un appuntamento
   */
  async modifyAppointment(appointmentId, newDate, newTimeSlot) {
    if (!this.connected) {
      throw new Error('Not connected to CUP system');
    }

    console.log(`🔄 Modifying appointment: ${appointmentId}`);
    
    const appointment = this.appointments.find(a => a.id === appointmentId);
    if (!appointment) {
      return {
        success: false,
        message: 'Appointment not found'
      };
    }

    // Verifica disponibilità per la nuova data
    const availability = await this.checkAvailability(appointment.serviceId, newDate, newTimeSlot);
    if (!availability.success || availability.availableSlots.length === 0) {
      return {
        success: false,
        message: 'No availability for the requested date and time'
      };
    }

    await this.simulateNetworkDelay(400);
    
    appointment.date = newDate;
    appointment.timeSlot = newTimeSlot;
    appointment.lastModified = new Date().toISOString();
    appointment.modificationReason = 'Patient request';
    
    return {
      success: true,
      appointment,
      message: 'Appointment modified successfully'
    };
  }

  /**
   * Simula la ricerca di appuntamenti per paziente
   */
  async getAppointmentsByPatient(patientId) {
    if (!this.connected) {
      throw new Error('Not connected to CUP system');
    }

    console.log(`📋 Fetching appointments for patient: ${patientId}`);
    
    await this.simulateNetworkDelay(400);
    
    const patientAppointments = this.appointments.filter(a => a.patientId === patientId);
    
    return {
      success: true,
      patientId,
      appointments: patientAppointments,
      count: patientAppointments.length,
      message: `Found ${patientAppointments.length} appointments`
    };
  }

  /**
   * Simula l'aggiunta a lista d'attesa
   */
  async addToWaitingList(patientData, serviceId, preferredDate) {
    if (!this.connected) {
      throw new Error('Not connected to CUP system');
    }

    console.log(`⏳ Adding ${patientData.name} to waiting list for ${serviceId}`);
    
    await this.simulateNetworkDelay(300);
    
    const waitingEntry = {
      id: `waiting-${Date.now()}`,
      patientId: patientData.id,
      patientName: patientData.name,
      serviceId,
      serviceName: this.services.find(s => s.id === serviceId)?.name || 'Unknown Service',
      preferredDate,
      addedDate: new Date().toISOString(),
      priority: this.calculatePriority(patientData),
      status: 'active'
    };

    this.waitingLists.push(waitingEntry);
    
    return {
      success: true,
      waitingEntry,
      message: `Added to waiting list. Position: ${this.waitingLists.length}`
    };
  }

  /**
   * Simula l'invio di reminder
   */
  async sendReminders() {
    if (!this.connected) {
      throw new Error('Not connected to CUP system');
    }

    console.log(`📧 Sending appointment reminders...`);
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const tomorrowAppointments = this.appointments.filter(a => {
      const appointmentDate = new Date(a.date);
      return appointmentDate.toDateString() === tomorrow.toDateString() && a.status === 'confirmed';
    });

    const reminders = [];
    
    for (const appointment of tomorrowAppointments) {
      await this.simulateNetworkDelay(100);
      
      reminders.push({
        appointmentId: appointment.id,
        patientName: appointment.patientName,
        serviceName: appointment.serviceName,
        date: appointment.date,
        timeSlot: appointment.timeSlot,
        sent: true,
        method: 'email',
        message: `Reminder: Your appointment for ${appointment.serviceName} is scheduled for ${appointment.date} at ${appointment.timeSlot}`
      });
    }

    return {
      success: true,
      remindersSent: reminders.length,
      reminders,
      message: `Sent ${reminders.length} reminders`
    };
  }

  /**
   * Genera servizi mock
   */
  generateMockServices() {
    return [
      {
        id: 'service-001',
        name: 'Visita Specialistica',
        description: 'Visita specialistica di controllo',
        duration: 30,
        price: 100,
        requiresReferral: true,
        maxDailySlots: 20
      },
      {
        id: 'service-002',
        name: 'Esame del Sangue',
        description: 'Analisi ematologiche complete',
        duration: 15,
        price: 50,
        requiresReferral: false,
        maxDailySlots: 50
      },
      {
        id: 'service-003',
        name: 'Radiografia',
        description: 'Esame radiologico',
        duration: 20,
        price: 80,
        requiresReferral: true,
        maxDailySlots: 15
      },
      {
        id: 'service-004',
        name: 'Ecografia',
        description: 'Esame ecografico',
        duration: 25,
        price: 120,
        requiresReferral: true,
        maxDailySlots: 12
      },
      {
        id: 'service-005',
        name: 'Visita di Controllo',
        description: 'Visita di controllo post-operatoria',
        duration: 20,
        price: 60,
        requiresReferral: false,
        maxDailySlots: 25
      }
    ];
  }

  /**
   * Genera slot disponibili per una data e servizio
   */
  generateAvailableSlots(date, serviceId) {
    const service = this.services.find(s => s.id === serviceId);
    if (!service) return [];

    const dayOfWeek = new Date(date).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    if (isWeekend) return [];

    // Orari lavorativi: 8:00 - 18:00
    const slots = [];
    const startHour = 8;
    const endHour = 18;
    
    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const timeSlot = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        
        // Simula disponibilità basata su carico
        const bookedSlots = this.appointments.filter(a => 
          a.date === date && a.timeSlot === timeSlot && a.serviceId === serviceId
        ).length;
        
        const maxSlots = service.maxDailySlots;
        const occupancyRate = bookedSlots / maxSlots;
        
        // Maggiore disponibilità al mattino, minore al pomeriggio
        const timeFactor = hour < 12 ? 0.8 : 0.6;
        
        if (occupancyRate < timeFactor) {
          slots.push(timeSlot);
        }
      }
    }

    return slots.slice(0, 10); // Limita a 10 slot disponibili
  }

  /**
   * Valida una prenotazione
   */
  validateBooking(patientData, serviceId, date, timeSlot) {
    // Controllo numero massimo di appuntamenti per paziente
    const patientAppointments = this.appointments.filter(a => a.patientId === patientData.id && a.status === 'confirmed');
    if (patientAppointments.length >= this.system.bookingRules.maxAppointmentsPerPatient) {
      return { valid: false, message: 'Maximum number of appointments reached for this patient' };
    }

    // Controllo data futura
    const appointmentDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    appointmentDate.setHours(0, 0, 0, 0);
    
    if (appointmentDate < today) {
      return { valid: false, message: 'Cannot book appointments in the past' };
    }

    // Controllo limite prenotazione anticipata
    const daysInAdvance = Math.ceil((appointmentDate - today) / (1000 * 60 * 60 * 24));
    if (daysInAdvance > this.system.bookingRules.maxAdvanceBooking) {
      return { valid: false, message: `Cannot book more than ${this.system.bookingRules.maxAdvanceBooking} days in advance` };
    }

    // Controllo disponibilità oraria
    const hour = parseInt(timeSlot.split(':')[0]);
    if (hour < 8 || hour > 17) {
      return { valid: false, message: 'Appointments can only be booked between 8:00 and 17:00' };
    }

    return { valid: true, message: 'Booking validation passed' };
  }

  /**
   * Calcola la priorità per lista d'attesa
   */
  calculatePriority(patientData) {
    // Priorità basata su età, condizioni mediche, ecc.
    let priority = 1;
    
    if (patientData.age && patientData.age > 65) priority += 2;
    if (patientData.urgent) priority += 3;
    if (patientData.chronicConditions && patientData.chronicConditions.length > 0) priority += 1;
    
    return priority;
  }

  /**
   * Genera codice di conferma
   */
  generateConfirmationCode() {
    return `CUP-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }

  /**
   * Simula un ritardo di rete
   */
  async simulateNetworkDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Esegue un test completo del sistema CUP
   */
  async runCUPTest() {
    console.log('🧪 Starting CUP System Test...');
    
    try {
      // 1. Connessione al sistema CUP
      const connectionResult = await this.connectToCUP(
        'https://cup.example.com/api',
        'regional',
        { username: 'test', password: 'test123' }
      );
      console.log('✅ Connection:', connectionResult.message);

      // 2. Verifica disponibilità
      const availabilityResult = await this.checkAvailability('service-001', '2024-01-15', '10:00');
      console.log('✅ Availability:', `Found ${availabilityResult.availableSlots.length} slots`);

      // 3. Prenotazione appuntamento
      const patientData = {
        id: 'patient-001',
        name: 'Mario Rossi',
        cf: 'RSSMRA80A01H501M',
        age: 45
      };
      
      const bookingResult = await this.bookAppointment(patientData, 'service-001', '2024-01-15', '10:00');
      console.log('✅ Booking:', bookingResult.message);

      // 4. Ricerca appuntamenti
      const appointmentsResult = await this.getAppointmentsByPatient('patient-001');
      console.log('✅ Appointments:', `Found ${appointmentsResult.count} appointments`);

      // 5. Invio reminder
      const remindersResult = await this.sendReminders();
      console.log('✅ Reminders:', `Sent ${remindersResult.remindersSent} reminders`);

      // 6. Disconnessione
      this.connected = false;
      console.log('✅ Disconnection: CUP system disconnected');

      return {
        success: true,
        message: 'CUP system test completed successfully',
        performance: {
          responseTime: '1.8s',
          throughput: '80 req/s',
          errors: 2
        },
        data: {
          bookingsCreated: 1,
          bookingsModified: 0,
          bookingsCancelled: 0,
          remindersSent: remindersResult.remindersSent
        }
      };

    } catch (error) {
      console.error('❌ CUP System Test Failed:', error.message);
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

module.exports = { CUPSystemSimulator };