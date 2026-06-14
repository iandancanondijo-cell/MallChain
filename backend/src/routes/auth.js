const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/authController');
const passport = require('passport');

router.post('/register', authCtrl.register);
router.post('/login', authCtrl.login);

// Google OAuth routes
router.get('/google', passport.authenticate('google', { scope: ['profile','email'] }));
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/' }), authCtrl.googleCallback);

module.exports = router;
