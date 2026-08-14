const KYC = require('../models/kyc');
const User = require('../models/user');

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
    
    // Check if user already has a pending KYC
    const existingKYC = await KYC.findOne({ userId, status: { $in: ['pending', 'review'] } });
    if (existingKYC) {
      return res.status(400).json({ error: 'KYC already in progress' });
    }

    // Perform AML check
    const { checks, riskLevel } = await performAMLCheck(kycData);

    const status = riskLevel === 'low' ? 'approved' : 'review';

    // Create KYC record
    const kyc = await KYC.create({
      userId,
      ...kycData,
      riskLevel,
      amlChecks: checks,
      status
    });

    // kycLevel 2 = approved; stays at the default 1 (unverified/pending) otherwise.
    if (status === 'approved') {
      await User.findByIdAndUpdate(userId, { kycLevel: 2 });
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

    // Update existing KYC or create new one
    const kyc = await KYC.findOneAndUpdate(
      { userId },
      { 
        riskLevel,
        amlChecks: checks,
        status: riskLevel === 'low' ? 'approved' : 'review'
      },
      { new: true, upsert: true }
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

    res.json({
      status: kyc.status,
      riskLevel: kyc.riskLevel,
      amlChecks: kyc.amlChecks,
      submittedAt: kyc.submittedAt
    });
  } catch (err) {
    console.error('KYC status error:', err);
    res.status(500).json({ error: 'Failed to get KYC status' });
  }
};
