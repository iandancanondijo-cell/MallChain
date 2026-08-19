const path = require('path');
const KYC = require('../models/kyc');
const User = require('../models/user');
const { KYC_UPLOAD_DIR } = require('../middleware/upload');

exports.uploadDocument = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No document uploaded' });
  }
  // The ref is just the on-disk filename — resolved back to a path only by
  // getDocument below, and never exposed as a public URL.
  res.json({ ok: true, documentRef: req.file.filename });
};

exports.getDocument = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const kyc = await KYC.findById(req.params.kycId);
    if (!kyc) return res.status(404).json({ error: 'Not found' });

    const isOwner = String(kyc.userId) === String(userId);
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!kyc.idDocumentUrl) {
      return res.status(404).json({ error: 'No document on file' });
    }

    // idDocumentUrl only needs to start with `${userId}-` (see submitKYC) —
    // nothing stops an owner from submitting e.g. `${userId}-../../../etc/passwd`
    // as the value. path.join would happily resolve that outside
    // KYC_UPLOAD_DIR, turning this into an arbitrary-file-read via a KYC
    // record the attacker owns. Strip any directory component so only a
    // bare filename inside KYC_UPLOAD_DIR can ever be served — this matches
    // what uploadDocument actually produces (multer's filename has no path
    // separators) and is a no-op for every legitimate document.
    const filePath = path.join(KYC_UPLOAD_DIR, path.basename(kyc.idDocumentUrl));
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Document not found' });
    });
  } catch (err) {
    console.error('KYC document fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
};

// Mock AML check function - in production, integrate with real AML providers
const performAMLCheck = async (kycData) => {
  // Simulate AML screening
  const checks = {
    sanctions: false, // Would check sanctions lists
    pep: kycData.politicalExposure, // PEP status from user input
    adverseMedia: false, // Would check adverse media databases
    watchlist: false // Would check watchlists
  };
  
  // Calculate risk level based on checks
  let riskLevel = 'low';
  if (checks.sanctions || checks.adverseMedia || checks.watchlist) {
    riskLevel = 'high';
  } else if (checks.pep) {
    riskLevel = 'medium';
  }
  
  return { checks, riskLevel };
};

exports.submitKYC = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const kycData = req.body;

    // idDocumentUrl is a client-supplied string (Joi only checks it's
    // non-empty) that getDocument later trusts to stream a file back to
    // whoever owns *this* KYC record — without this check, submitting
    // another user's uploaded filename (predictable: `${userId}-${ts}-
    // ${name}`, see upload.js) would let an attacker read that user's ID
    // document back through their own, legitimately-owned KYC record.
    if (kycData.idDocumentUrl && !kycData.idDocumentUrl.startsWith(`${userId}-`)) {
      return res.status(403).json({ error: 'Document was not uploaded by this account' });
    }

    // Check if user already has a pending KYC
    const existingKYC = await KYC.findOne({ userId, status: { $in: ['pending', 'review'] } });
    if (existingKYC) {
      return res.status(400).json({ error: 'KYC already in progress' });
    }

    // The AML check below is a mocked signal (no real sanctions/watchlist
    // provider is integrated) — it's informational input for an admin's
    // review, not an approval trigger. Every submission requires a real
    // human decision now; nothing here can auto-approve.
    const { checks, riskLevel } = await performAMLCheck(kycData);
    const status = 'pending';

    // Create KYC record
    const kyc = await KYC.create({
      userId,
      ...kycData,
      riskLevel,
      amlChecks: checks,
      status
    });

    // A real name only exists here (KYC firstName/lastName) — the account
    // record has no name field of its own. Populate it as a display
    // convenience, but never clobber a name the user already set manually
    // via their profile.
    if (kycData.firstName || kycData.lastName) {
      const user = await User.findById(userId).select('name');
      if (user && !user.name) {
        await User.findByIdAndUpdate(userId, {
          name: [kycData.firstName, kycData.lastName].filter(Boolean).join(' '),
        });
      }
    }

    res.json({
      success: true,
      kycId: kyc._id,
      riskLevel,
      status,
      checks
    });
  } catch (err) {
    console.error('KYC submission error:', err);
    res.status(500).json({ error: 'Failed to submit KYC' });
  }
};

exports.runAMLCheck = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { kycData, walletAddress } = req.body;
    
    // Perform AML check
    const { checks, riskLevel } = await performAMLCheck(kycData);

    // Update existing KYC or create new one — this is a mocked signal, not
    // an approval trigger (see submitKYC for the same reasoning); status is
    // left untouched here so a real admin decision is what changes it.
    const kyc = await KYC.findOneAndUpdate(
      { userId },
      {
        riskLevel,
        amlChecks: checks,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ 
      success: true, 
      checks, 
      riskLevel 
    });
  } catch (err) {
    console.error('AML check error:', err);
    res.status(500).json({ error: 'Failed to run AML check' });
  }
};

exports.getKYCStatus = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const kyc = await KYC.findOne({ userId }).sort({ submittedAt: -1 });

    if (!kyc) {
      return res.json({ status: 'not_submitted' });
    }

    // This is the user's own submission — safe to return in full so a
    // real "Profile" view can show exactly what was submitted and what an
    // admin has (or hasn't) verified, instead of just a bare status chip.
    res.json({
      kycId: kyc._id,
      status: kyc.status,
      riskLevel: kyc.riskLevel,
      amlChecks: kyc.amlChecks,
      submittedAt: kyc.submittedAt,
      reviewedAt: kyc.reviewedAt || null,
      notes: kyc.notes || '',
      hasDocument: !!kyc.idDocumentUrl,
      personal: {
        firstName: kyc.firstName,
        lastName: kyc.lastName,
        dateOfBirth: kyc.dateOfBirth,
        nationality: kyc.nationality,
      },
      address: {
        address: kyc.address,
        city: kyc.city,
        country: kyc.country,
        postalCode: kyc.postalCode,
        phoneNumber: kyc.phoneNumber,
      },
      identity: {
        idType: kyc.idType,
        idNumber: kyc.idNumber,
        idExpiry: kyc.idExpiry,
      },
      financial: {
        occupation: kyc.occupation,
        sourceOfFunds: kyc.sourceOfFunds,
        annualIncome: kyc.annualIncome,
        politicalExposure: kyc.politicalExposure,
      },
    });
  } catch (err) {
    console.error('KYC status error:', err);
    res.status(500).json({ error: 'Failed to get KYC status' });
  }
};
