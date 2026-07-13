/**
 * Security and Compliance System
 * Implementa sicurezza, crittografia e conformità GDPR per sistemi ospedalieri
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

class SecuritySystem {
  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY || this.generateEncryptionKey();
    this.algorithm = 'aes-256-gcm';
    this.ivLength = 16;
    this.tagLength = 16;
    this.saltRounds = 12;
    
    // Audit trail
    this.auditLog = [];
    
    // Access control
    this.permissions = {
      'ehr_integration': ['admin', 'tech', 'medical_staff'],
      'patient_data': ['admin', 'medical_staff'],
      'system_config': ['admin'],
      'view_docs': ['all']
    };
  }

  /**
   * Genera una chiave di crittografia sicura
   */
  generateEncryptionKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Crittografa dati sensibili con AES-256-GCM
   */
  encryptData(data) {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
      cipher.setAAD(Buffer.from('hospital-data', 'utf8'));
      
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return {
        success: true,
        encryptedData: encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        algorithm: this.algorithm
      };
    } catch (error) {
      this.logAudit('ENCRYPTION_ERROR', 'SYSTEM', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Decrittografa dati sensibili
   */
  decryptData(encryptedData, iv, tag) {
    try {
      const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
      decipher.setAAD(Buffer.from('hospital-data', 'utf8'));
      decipher.setAuthTag(Buffer.from(tag, 'hex'));
      
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return {
        success: true,
        decryptedData: JSON.parse(decrypted)
      };
    } catch (error) {
      this.logAudit('DECRYPTION_ERROR', 'SYSTEM', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Hash password con bcrypt
   */
  hashPassword(password) {
    return bcrypt.hash(password, this.saltRounds);
  }

  /**
   * Verifica password
   */
  verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  /**
   * Genera token JWT sicuro
   */
  generateJWT(payload, expiresIn = '24h') {
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'hospital-secret-key';
    
    return jwt.sign(payload, secret, { expiresIn });
  }

  /**
   * Verifica token JWT
   */
  verifyJWT(token) {
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'hospital-secret-key';
    
    try {
      return jwt.verify(token, secret);
    } catch (error) {
      this.logAudit('JWT_VERIFICATION_FAILED', 'SYSTEM', { error: error.message });
      return null;
    }
  }

  /**
   * Controllo accessi basato sui ruoli
   */
  checkAccess(userRole, resource) {
    const allowedRoles = this.permissions[resource];
    
    if (!allowedRoles) {
      this.logAudit('ACCESS_DENIED', userRole, { resource, reason: 'Resource not found' });
      return false;
    }
    
    const hasAccess = allowedRoles.includes(userRole) || allowedRoles.includes('all');
    
    if (!hasAccess) {
      this.logAudit('ACCESS_DENIED', userRole, { resource, reason: 'Insufficient permissions' });
    } else {
      this.logAudit('ACCESS_GRANTED', userRole, { resource });
    }
    
    return hasAccess;
  }

  /**
   * Log audit trail per tracciamento accessi
   */
  logAudit(action, user, details = {}) {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      action,
      user,
      details,
      ipAddress: details.ipAddress || 'unknown',
      userAgent: details.userAgent || 'unknown'
    };
    
    this.auditLog.push(auditEntry);
    
    // Log su console per debug
    console.log(`🔒 AUDIT: ${action} - User: ${user} - Details:`, details);
    
    // In produzione, invierei questo log a un sistema SIEM
    this.sendToSIEM(auditEntry);
  }

  /**
   * Invia log a sistema SIEM (Security Information and Event Management)
   */
  async sendToSIEM(logEntry) {
    // Simula invio a sistema SIEM
    try {
      // In produzione, qui ci sarebbe una chiamata a un servizio SIEM
      console.log(`📡 SIEM: Sending audit log for ${logEntry.action}`);
      
      // Simula invio asincrono
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return { success: true, message: 'Log sent to SIEM' };
    } catch (error) {
      console.error('❌ SIEM Error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Crittografia dati paziente
   */
  encryptPatientData(patientData) {
    // Campi sensibili da crittografare
    const sensitiveFields = [
      'name', 'address', 'phone', 'email', 'cf', 'healthCard', 'medicalHistory'
    ];
    
    const encryptedData = { ...patientData };
    
    for (const field of sensitiveFields) {
      if (patientData[field]) {
        const encrypted = this.encryptData(patientData[field]);
        if (encrypted.success) {
          encryptedData[field] = {
            encrypted: true,
            data: encrypted.encryptedData,
            iv: encrypted.iv,
            tag: encrypted.tag
          };
        }
      }
    }
    
    this.logAudit('PATIENT_DATA_ENCRYPTED', 'SYSTEM', { 
      patientId: patientData.id,
      fieldsEncrypted: sensitiveFields.length 
    });
    
    return encryptedData;
  }

  /**
   * Decrittografia dati paziente
   */
  decryptPatientData(encryptedPatientData) {
    const sensitiveFields = [
      'name', 'address', 'phone', 'email', 'cf', 'healthCard', 'medicalHistory'
    ];
    
    const decryptedData = { ...encryptedPatientData };
    
    for (const field of sensitiveFields) {
      if (encryptedPatientData[field] && encryptedPatientData[field].encrypted) {
        const encrypted = encryptedPatientData[field];
        const decrypted = this.decryptData(encrypted.data, encrypted.iv, encrypted.tag);
        
        if (decrypted.success) {
          decryptedData[field] = decrypted.decryptedData;
        }
      }
    }
    
    this.logAudit('PATIENT_DATA_DECRYPTED', 'SYSTEM', { 
      patientId: encryptedPatientData.id 
    });
    
    return decryptedData;
  }

  /**
   * Controllo conformità GDPR
   */
  checkGDPRCompliance(data) {
    const compliance = {
      hasConsent: false,
      hasDataMinimization: false,
      hasRetentionPolicy: false,
      hasRightToErasure: false,
      score: 0
    };
    
    // Verifica consenso informato
    if (data.consent && data.consent.gdpr) {
      compliance.hasConsent = true;
      compliance.score += 25;
    }
    
    // Verifica minimizzazione dati
    const requiredFields = ['id', 'name', 'cf'];
    const hasRequiredFields = requiredFields.every(field => data[field]);
    if (hasRequiredFields) {
      compliance.hasDataMinimization = true;
      compliance.score += 25;
    }
    
    // Verifica politica di conservazione
    if (data.retentionPolicy) {
      compliance.hasRetentionPolicy = true;
      compliance.score += 25;
    }
    
    // Verifica diritto all'oblio
    if (data.rightToErasure) {
      compliance.hasRightToErasure = true;
      compliance.score += 25;
    }
    
    this.logAudit('GDPR_COMPLIANCE_CHECK', 'SYSTEM', {
      patientId: data.id,
      complianceScore: compliance.score,
      details: compliance
    });
    
    return compliance;
  }

  /**
   * Genera report di sicurezza
   */
  generateSecurityReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalAudits: this.auditLog.length,
      accessGranted: this.auditLog.filter(a => a.action === 'ACCESS_GRANTED').length,
      accessDenied: this.auditLog.filter(a => a.action === 'ACCESS_DENIED').length,
      encryptionOperations: this.auditLog.filter(a => a.action.includes('ENCRYPT')).length,
      decryptionOperations: this.auditLog.filter(a => a.action.includes('DECRYPT')).length,
      suspiciousActivities: this.detectSuspiciousActivities()
    };
    
    return report;
  }

  /**
   * Rileva attività sospette
   */
  detectSuspiciousActivities() {
    const suspicious = [];
    
    // Rileva troppi tentativi di accesso negato
    const deniedAccess = this.auditLog.filter(a => a.action === 'ACCESS_DENIED');
    const deniedByUser = {};
    
    deniedAccess.forEach(entry => {
      deniedByUser[entry.user] = (deniedByUser[entry.user] || 0) + 1;
    });
    
    Object.entries(deniedByUser).forEach(([user, count]) => {
      if (count > 5) {
        suspicious.push({
          type: 'MULTIPLE_ACCESS_DENIED',
          user,
          count,
          severity: 'HIGH'
        });
      }
    });
    
    // Rileva accessi fuori orario
    const nightAccess = this.auditLog.filter(entry => {
      const hour = new Date(entry.timestamp).getHours();
      return hour < 6 || hour > 22;
    });
    
    if (nightAccess.length > 10) {
      suspicious.push({
        type: 'UNUSUAL_ACCESS_HOURS',
        count: nightAccess.length,
        severity: 'MEDIUM'
      });
    }
    
    return suspicious;
  }

  /**
   * Backup sicuro dei dati crittografati
   */
  async secureBackup(data) {
    try {
      // Crittografa i dati prima del backup
      const encryptedData = this.encryptData(data);
      
      if (!encryptedData.success) {
        throw new Error('Encryption failed');
      }
      
      // Simula backup su storage sicuro
      const backupResult = {
        success: true,
        backupId: `backup-${Date.now()}`,
        encrypted: true,
        size: JSON.stringify(encryptedData).length,
        timestamp: new Date().toISOString()
      };
      
      this.logAudit('SECURE_BACKUP_CREATED', 'SYSTEM', backupResult);
      
      return backupResult;
    } catch (error) {
      this.logAudit('SECURE_BACKUP_FAILED', 'SYSTEM', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Ripristino sicuro dei dati
   */
  async secureRestore(backupId, encryptedData) {
    try {
      // Decrittografa i dati del backup
      const decrypted = this.decryptData(encryptedData.data, encryptedData.iv, encryptedData.tag);
      
      if (!decrypted.success) {
        throw new Error('Decryption failed');
      }
      
      const restoreResult = {
        success: true,
        backupId,
        restoredSize: JSON.stringify(decrypted.decryptedData).length,
        timestamp: new Date().toISOString()
      };
      
      this.logAudit('SECURE_RESTORE_COMPLETED', 'SYSTEM', restoreResult);
      
      return restoreResult;
    } catch (error) {
      this.logAudit('SECURE_RESTORE_FAILED', 'SYSTEM', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Monitoraggio sicurezza in tempo reale
   */
  startSecurityMonitoring() {
    console.log('🔒 Starting real-time security monitoring...');
    
    // Simula monitoraggio continuo
    setInterval(() => {
      const report = this.generateSecurityReport();
      
      // Allerta se ci sono attività sospette
      if (report.suspiciousActivities.length > 0) {
        console.warn('⚠️ SECURITY ALERT:', report.suspiciousActivities);
        this.sendSecurityAlert(report.suspiciousActivities);
      }
    }, 60000); // Controllo ogni minuto
  }

  /**
   * Invia alert di sicurezza
   */
  async sendSecurityAlert(alerts) {
    // Simula invio alert di sicurezza
    console.log('🚨 Sending security alerts:', alerts);
    
    // In produzione, invierei alert via email/SMS ai responsabili IT
    return { success: true, alertsSent: alerts.length };
  }
}

module.exports = { SecuritySystem };