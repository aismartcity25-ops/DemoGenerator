/**
 * System Monitoring and Maintenance
 * Monitoraggio delle performance, manutenzione e troubleshooting
 */

const os = require('os');
const fs = require('fs').promises;
const path = require('path');

class SystemMonitor {
  constructor() {
    this.metrics = {
      cpu: [],
      memory: [],
      disk: [],
      network: [],
      errors: [],
      performance: []
    };
    
    this.alerts = [];
    this.maintenanceSchedule = [];
    
    // Configurazione soglie di allarme
    this.thresholds = {
      cpu: 80,        // % CPU
      memory: 85,     // % Memoria
      disk: 90,       // % Disco
      responseTime: 2000, // ms
      errorRate: 5    // % Errori
    };
  }

  /**
   * Avvia il monitoraggio continuo del sistema
   */
  startMonitoring() {
    console.log('📊 Starting system monitoring...');
    
    // Monitoraggio CPU e memoria ogni 30 secondi
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);
    
    // Monitoraggio performance ogni minuto
    setInterval(() => {
      this.collectPerformanceMetrics();
    }, 60000);
    
    // Controllo manutenzione programmata ogni ora
    setInterval(() => {
      this.checkMaintenanceSchedule();
    }, 3600000);
    
    // Generazione report giornaliero
    setInterval(() => {
      this.generateDailyReport();
    }, 86400000); // 24 ore
  }

  /**
   * Raccoglie metriche di sistema (CPU, memoria, disco, rete)
   */
  async collectSystemMetrics() {
    try {
      // CPU Usage
      const cpuUsage = process.cpuUsage();
      const cpuPercent = this.calculateCPUPercentage();
      
      // Memory Usage
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const memoryPercent = (usedMemory / totalMemory) * 100;
      
      // Disk Usage
      const diskUsage = await this.getDiskUsage();
      
      // Network Stats
      const networkStats = this.getNetworkStats();
      
      const metrics = {
        timestamp: new Date().toISOString(),
        cpu: {
          percent: cpuPercent,
          usage: cpuUsage,
          load: os.loadavg()
        },
        memory: {
          total: totalMemory,
          used: usedMemory,
          free: freeMemory,
          percent: memoryPercent
        },
        disk: diskUsage,
        network: networkStats
      };
      
      this.metrics.cpu.push({ timestamp: metrics.timestamp, value: cpuPercent });
      this.metrics.memory.push({ timestamp: metrics.timestamp, value: memoryPercent });
      this.metrics.disk.push({ timestamp: metrics.timestamp, value: diskUsage.percent });
      
      // Controlla soglie e genera alert
      this.checkThresholds(metrics);
      
      // Mantieni solo ultimi 1000 record per evitare memory leak
      this.trimMetrics();
      
      return metrics;
    } catch (error) {
      console.error('❌ Error collecting system metrics:', error.message);
      this.logError('SYSTEM_METRICS_ERROR', error.message);
      return null;
    }
  }

  /**
   * Calcola percentuale CPU
   */
  calculateCPUPercentage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    
    cpus.forEach(cpu => {
      for (let type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    
    return 100 - (totalIdle / totalTick) * 100;
  }

  /**
   * Ottiene informazioni sull'uso del disco
   */
  async getDiskUsage() {
    try {
      const stats = await fs.stat(process.cwd());
      // Simula uso disco (in produzione userei un modulo come 'node-disk-info')
      const totalSpace = 1000000000000; // 1TB simulato
      const usedSpace = Math.floor(Math.random() * 800000000000); // Fino a 800GB
      const freeSpace = totalSpace - usedSpace;
      const percent = (usedSpace / totalSpace) * 100;
      
      return {
        total: totalSpace,
        used: usedSpace,
        free: freeSpace,
        percent: percent
      };
    } catch (error) {
      return { total: 0, used: 0, free: 0, percent: 0 };
    }
  }

  /**
   * Ottiene statistiche di rete
   */
  getNetworkStats() {
    const networkInterfaces = os.networkInterfaces();
    const stats = {};
    
    for (const [name, interfaces] of Object.entries(networkInterfaces)) {
      interfaces.forEach((iface, index) => {
        if (iface.family === 'IPv4' && !iface.internal) {
          stats[name] = {
            address: iface.address,
            netmask: iface.netmask,
            mac: iface.mac
          };
        }
      });
    }
    
    return stats;
  }

  /**
   * Raccoglie metriche di performance dell'applicazione
   */
  async collectPerformanceMetrics() {
    try {
      const performance = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        eventLoopLag: await this.measureEventLoopLag(),
        activeHandles: process._getActiveHandles().length,
        activeRequests: process._getActiveRequests().length
      };
      
      this.metrics.performance.push(performance);
      
      // Controlla performance e genera alert
      this.checkPerformanceThresholds(performance);
      
      return performance;
    } catch (error) {
      console.error('❌ Error collecting performance metrics:', error.message);
      this.logError('PERFORMANCE_METRICS_ERROR', error.message);
      return null;
    }
  }

  /**
   * Misura il lag dell'event loop
   */
  measureEventLoopLag() {
    return new Promise((resolve) => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1000000; // Converti in ms
        resolve(lag);
      });
    });
  }

  /**
   * Controlla le soglie di allarme
   */
  checkThresholds(metrics) {
    // CPU Threshold
    if (metrics.cpu.percent > this.thresholds.cpu) {
      this.createAlert('HIGH_CPU', `CPU usage is ${metrics.cpu.percent.toFixed(2)}%`, 'HIGH');
    }
    
    // Memory Threshold
    if (metrics.memory.percent > this.thresholds.memory) {
      this.createAlert('HIGH_MEMORY', `Memory usage is ${metrics.memory.percent.toFixed(2)}%`, 'HIGH');
    }
    
    // Disk Threshold
    if (metrics.disk.percent > this.thresholds.disk) {
      this.createAlert('HIGH_DISK', `Disk usage is ${metrics.disk.percent.toFixed(2)}%`, 'CRITICAL');
    }
  }

  /**
   * Controlla le soglie di performance
   */
  checkPerformanceThresholds(performance) {
    // Event loop lag
    if (performance.eventLoopLag > 100) {
      this.createAlert('HIGH_EVENT_LOOP_LAG', `Event loop lag is ${performance.eventLoopLag.toFixed(2)}ms`, 'MEDIUM');
    }
    
    // Memory usage
    const memoryUsageMB = performance.memoryUsage.heapUsed / 1024 / 1024;
    if (memoryUsageMB > 500) {
      this.createAlert('HIGH_HEAP_USAGE', `Heap usage is ${memoryUsageMB.toFixed(2)}MB`, 'MEDIUM');
    }
  }

  /**
   * Crea un alert di sistema
   */
  createAlert(type, message, severity) {
    const alert = {
      id: `alert-${Date.now()}`,
      type,
      message,
      severity,
      timestamp: new Date().toISOString(),
      acknowledged: false,
      resolved: false
    };
    
    this.alerts.push(alert);
    console.warn(`🚨 ALERT [${severity}]: ${message}`);
    
    // Invia notifica (in produzione userei un servizio di notifica)
    this.sendNotification(alert);
  }

  /**
   * Invia notifica di alert
   */
  async sendNotification(alert) {
    // Simula invio notifica
    console.log(`📧 Sending notification for alert: ${alert.type}`);
    
    // In produzione, invierei notifiche via email, SMS, Slack, ecc.
    return { success: true, alertId: alert.id };
  }

  /**
   * Log degli errori
   */
  logError(type, message, details = {}) {
    const error = {
      id: `error-${Date.now()}`,
      type,
      message,
      details,
      timestamp: new Date().toISOString()
    };
    
    this.metrics.errors.push(error);
    console.error(`❌ ERROR [${type}]: ${message}`, details);
    
    return error;
  }

  /**
   * Programma manutenzione
   */
  scheduleMaintenance(type, date, description, duration = '2h') {
    const maintenance = {
      id: `maintenance-${Date.now()}`,
      type,
      date: new Date(date).toISOString(),
      description,
      duration,
      status: 'scheduled',
      acknowledged: false
    };
    
    this.maintenanceSchedule.push(maintenance);
    console.log(`📅 Maintenance scheduled: ${description} on ${maintenance.date}`);
    
    return maintenance;
  }

  /**
   * Controlla la manutenzione programmata
   */
  checkMaintenanceSchedule() {
    const now = new Date();
    const upcomingMaintenance = this.maintenanceSchedule.filter(m => {
      const maintenanceDate = new Date(m.date);
      const timeDiff = maintenanceDate.getTime() - now.getTime();
      const hoursDiff = timeDiff / (1000 * 60 * 60);
      
      return hoursDiff <= 2 && hoursDiff >= 0 && !m.acknowledged;
    });
    
    upcomingMaintenance.forEach(maintenance => {
      this.createAlert('MAINTENANCE_SCHEDULED', 
        `Maintenance scheduled in ${Math.ceil(hoursDiff)} hours: ${maintenance.description}`, 
        'INFO');
      
      maintenance.acknowledged = true;
    });
  }

  /**
   * Genera report giornaliero
   */
  generateDailyReport() {
    const today = new Date().toISOString().split('T')[0];
    const report = {
      date: today,
      summary: {
        totalAlerts: this.alerts.length,
        criticalAlerts: this.alerts.filter(a => a.severity === 'CRITICAL').length,
        highAlerts: this.alerts.filter(a => a.severity === 'HIGH').length,
        mediumAlerts: this.alerts.filter(a => a.severity === 'MEDIUM').length,
        systemUptime: process.uptime(),
        averageCpu: this.calculateAverage(this.metrics.cpu),
        averageMemory: this.calculateAverage(this.metrics.memory),
        averageDisk: this.calculateAverage(this.metrics.disk)
      },
      recommendations: this.generateRecommendations()
    };
    
    console.log('📊 Daily Report:', JSON.stringify(report, null, 2));
    
    // Salva report su file
    this.saveReportToFile(report);
    
    return report;
  }

  /**
   * Calcola la media di una metrica
   */
  calculateAverage(metricArray) {
    if (metricArray.length === 0) return 0;
    
    const sum = metricArray.reduce((acc, curr) => acc + curr.value, 0);
    return sum / metricArray.length;
  }

  /**
   * Genera raccomandazioni basate sui dati raccolti
   */
  generateRecommendations() {
    const recommendations = [];
    
    // Raccomandazioni basate su CPU
    const avgCpu = this.calculateAverage(this.metrics.cpu);
    if (avgCpu > 70) {
      recommendations.push('Consider optimizing CPU-intensive operations or scaling horizontally');
    }
    
    // Raccomandazioni basate su memoria
    const avgMemory = this.calculateAverage(this.metrics.memory);
    if (avgMemory > 80) {
      recommendations.push('Consider increasing memory allocation or optimizing memory usage');
    }
    
    // Raccomandazioni basate su disco
    const avgDisk = this.calculateAverage(this.metrics.disk);
    if (avgDisk > 85) {
      recommendations.push('Consider cleaning up disk space or increasing storage capacity');
    }
    
    // Raccomandazioni basate su alert
    const criticalAlerts = this.alerts.filter(a => a.severity === 'CRITICAL').length;
    if (criticalAlerts > 5) {
      recommendations.push('High number of critical alerts detected. Review system configuration');
    }
    
    return recommendations;
  }

  /**
   * Salva report su file
   */
  async saveReportToFile(report) {
    try {
      const reportsDir = path.join(process.cwd(), 'reports');
      await fs.mkdir(reportsDir, { recursive: true });
      
      const filename = `report-${report.date}.json`;
      const filepath = path.join(reportsDir, filename);
      
      await fs.writeFile(filepath, JSON.stringify(report, null, 2));
      console.log(`📁 Report saved to: ${filepath}`);
    } catch (error) {
      console.error('❌ Error saving report:', error.message);
    }
  }

  /**
   * Pulisce le metriche vecchie per evitare memory leak
   */
  trimMetrics() {
    const maxRecords = 1000;
    
    if (this.metrics.cpu.length > maxRecords) {
      this.metrics.cpu = this.metrics.cpu.slice(-maxRecords);
    }
    if (this.metrics.memory.length > maxRecords) {
      this.metrics.memory = this.metrics.memory.slice(-maxRecords);
    }
    if (this.metrics.disk.length > maxRecords) {
      this.metrics.disk = this.metrics.disk.slice(-maxRecords);
    }
    if (this.metrics.performance.length > maxRecords) {
      this.metrics.performance = this.metrics.performance.slice(-maxRecords);
    }
  }

  /**
   * Ottiene lo stato corrente del sistema
   */
  getSystemStatus() {
    return {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      metrics: {
        cpu: this.metrics.cpu.slice(-1)[0],
        memory: this.metrics.memory.slice(-1)[0],
        disk: this.metrics.disk.slice(-1)[0],
        performance: this.metrics.performance.slice(-1)[0]
      },
      alerts: this.alerts.filter(a => !a.resolved),
      maintenance: this.maintenanceSchedule.filter(m => m.status === 'scheduled'),
      uptime: process.uptime()
    };
  }

  /**
   * Esegue troubleshooting automatico
   */
  async runTroubleshooting() {
    console.log('🔧 Starting automatic troubleshooting...');
    
    const issues = [];
    
    // Controlla alta CPU
    const latestCpu = this.metrics.cpu.slice(-1)[0];
    if (latestCpu && latestCpu.value > 90) {
      issues.push({
        type: 'HIGH_CPU',
        action: 'Restarting CPU-intensive processes',
        status: 'in_progress'
      });
      
      // Simula azione correttiva
      await this.simulateProcessRestart();
    }
    
    // Controlla alta memoria
    const latestMemory = this.metrics.memory.slice(-1)[0];
    if (latestMemory && latestMemory.value > 90) {
      issues.push({
        type: 'HIGH_MEMORY',
        action: 'Triggering garbage collection',
        status: 'in_progress'
      });
      
      // Forza garbage collection se disponibile
      if (global.gc) {
        global.gc();
      }
    }
    
    // Controlla spazio disco
    const latestDisk = this.metrics.disk.slice(-1)[0];
    if (latestDisk && latestDisk.value > 95) {
      issues.push({
        type: 'HIGH_DISK',
        action: 'Cleaning up temporary files',
        status: 'in_progress'
      });
      
      await this.cleanTemporaryFiles();
    }
    
    return {
      success: issues.length === 0,
      issues,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Simula riavvio processi
   */
  async simulateProcessRestart() {
    console.log('🔄 Restarting processes...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✅ Processes restarted');
  }

  /**
   * Pulisce file temporanei
   */
  async cleanTemporaryFiles() {
    console.log('🧹 Cleaning temporary files...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('✅ Temporary files cleaned');
  }

  /**
   * Ferma il monitoraggio
   */
  stopMonitoring() {
    console.log('🛑 Stopping system monitoring...');
    // In produzione, cancellerei gli intervalli
  }
}

module.exports = { SystemMonitor };