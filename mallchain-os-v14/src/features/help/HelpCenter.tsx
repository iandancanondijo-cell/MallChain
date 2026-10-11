import { useMemo, useRef, useState, useEffect } from 'react';
import './HelpCenter.css';

/* Help Center — searchable, categorized guides written from this platform's
 * actual behavior (token economy, Mines review, escrow, KYC, M-Pesa rails).
 * Content is static documentation by nature; quick links point at real,
 * live in-app routes. */

type HelpBlock =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'note'; tone: 'info' | 'warn' | 'ok'; text: string }
  | { kind: 'links'; items: { label: string; href?: string; cat?: string; art?: string }[] };

interface HelpArticle {
  id: string;
  title: string;
  tags: string[];
  updated: string;
  body: HelpBlock[];
}

interface HelpCategory {
  id: string;
  icon: string;
  name: string;
  blurb: string;
  articles: HelpArticle[];
}

const UPDATED = 'October 2026';

const CATEGORIES: HelpCategory[] = [
  {
    id: 'start',
    icon: '🚀',
    name: 'Getting started',
    blurb: 'Your account, your wallet, and your first minutes on Mallchain.',
    articles: [
      {
        id: 'create-account',
        title: 'Creating your account and signing in',
        tags: ['signup', 'register', 'login', 'password', 'age'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'You can browse the landing page and the explorer without an account, but earning, trading, and task work all need one. Registration asks for an email address and a password, and — because Mallchain deals in real value — confirms you are old enough to hold a financial account. This is a one-time age check, not something you redo later.' },
          { kind: 'h', text: 'Signing up' },
          { kind: 'list', items: [
            'Pick "Get Started" from the landing page and enter your email and a strong password.',
            'Confirm you meet the age requirement and accept the terms — the platform enforces this, so the checkbox cannot be skipped.',
            'Verify your email when the message arrives. Some features stay locked until the address is confirmed.',
          ] },
          { kind: 'note', tone: 'warn', text: 'Mallchain staff will never ask for your password. If a message or site asking for it claims to be us, it is not us.' },
          { kind: 'links', items: [{ label: 'Go to sign in / sign up', href: '#/auth' }] },
        ],
      },
      {
        id: 'create-wallet',
        title: 'Creating your wallet (and why tasks need one)',
        tags: ['wallet', 'mnemonic', 'keys', 'pin', 'earning'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'A wallet is a keypair that lives on the Mallchain — it is where your MLCNS sits and what signs your transactions. It is also a hard requirement for earning: campaign tasks and other rewards pay into a wallet, so the platform will not let you earn until one exists. This is deliberate — it stops points from being credited to accounts that have nowhere to receive them.' },
          { kind: 'h', text: 'What happens at creation' },
          { kind: 'list', items: [
            'The app generates a 24-word recovery phrase and shows it once. Write it down on paper — this is the only time it is displayed.',
            'You are asked to set a PIN. The PIN encrypts your keys at rest, so actions that sign transactions re-prompt for it.',
            'The phrase itself is kept in session-scoped memory, not in your browser storage — closing the tab clears it.',
          ] },
          { kind: 'note', tone: 'ok', text: 'Lose your phrase and lose your wallet access — there is no reset, because there is no central copy. See the security guide on recovery phrases before skipping this step.' },
          { kind: 'links', items: [
            { label: 'Recovery phrase: what it is and who to share it with', cat: 'security', art: 'recovery-phrase' },
            { label: 'Open the wallet hub', href: '#/wallet' },
          ] },
        ],
      },
      {
        id: 'dashboard-tour',
        title: 'A quick tour of the dashboard',
        tags: ['dashboard', 'navigation', 'sidebar', 'explorer'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'After signing in you land on the dashboard. The left sidebar is organized the way the platform is organized, top to bottom:' },
          { kind: 'list', items: [
            'Wallet — balances, sending, receiving, buying, converting, staking, and your transaction history.',
            'Mines — campaign tasks you can complete for MLPTS, plus your submissions, earnings, and (if you opt in) review work.',
            'Marketplace — escrow-protected listings between users.',
            'Validators, Governance, Explorer — the chain itself: who produces blocks, what is being voted on, and live block data.',
            'Settings — profile, verification (KYC), notifications, and security.',
          ] },
          { kind: 'p', text: 'Anything showing a number — balances, rewards, chain height — is read from live services, not stored screenshots. If a value looks wrong, refresh before worrying: views poll on an interval while the page is open.' },
        ],
      },
    ],
  },
  {
    id: 'tokens',
    icon: '💰',
    name: 'Wallet & tokens',
    blurb: 'MLPTS, MLCNS, MALL — what each one is and how they move.',
    articles: [
      {
        id: 'tokens-explained',
        title: 'MLPTS vs MLCNS vs MALL — three different things',
        tags: ['mlpts', 'mlcns', 'mall', 'tokenomics', 'supply', 'emission'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'These three names get mixed up constantly, so start here.' },
          { kind: 'h', text: 'MALL — the chain\'s base token' },
          { kind: 'p', text: 'MALL has a fixed total supply of 670,000,000. Nothing beyond that ever gets minted. New coins enter circulation on a fixed emission schedule: 36-month phases, starting at 3,000,000 MALL per month and halving each phase (phase 2 is 1,500,000/month, phase 3 is 750,000, and so on). Nobody can speed this up — it is a fixed schedule, not a market or governance decision.' },
          { kind: 'h', text: 'MLPTS — points you earn' },
          { kind: 'p', text: 'Mallpoints are earned, not minted: campaign tasks, education rewards, and similar activities credit MLPTS to your account. They are the entry layer of the economy. You cannot send MLPTS to another user — the path to a transferable token is converting them (which burns them).' },
          { kind: 'h', text: 'MLCNS — the liquid token you hold and spend' },
          { kind: 'p', text: 'MLCNS is the tradable form: buying, selling, sending, and staking all happen in MLCNS. It is backed by the conversion flow — MLPTS are burned and MLCNS is minted at a fiat-pegged rate. Transfers of MLCNS carry a small fee (1% at time of writing): half goes to active stakers, split proportionally to their stake, and half to the treasury. That is what "staking rewards" actually are here — a share of real transaction activity, not tokens created from nothing.' },
          { kind: 'links', items: [
            { label: 'Buying Mallpoints with M-Pesa', href: '#/mallpoints-purchase' },
            { label: 'Converting MLPTS to MLCNS', href: '#/wallet' },
          ] },
        ],
      },
      {
        id: 'send-receive',
        title: 'Sending and receiving MLCNS',
        tags: ['send', 'receive', 'transfer', 'fee', 'address'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'Transfers move MLCNS from one on-chain address to another. Your address is in the Receive tab of the wallet — anyone can send to it, and it is safe to share.' },
          { kind: 'h', text: 'Before you send' },
          { kind: 'list', items: [
            'Double-check the address. Transfers are validated on-chain, but a valid-looking address that belongs to nobody accepts your funds all the same.',
            'The current transfer fee is 1% of the amount. Half is distributed to active stakers proportional to their stake; half goes to the treasury.',
            'Larger sends re-prompt for your vault PIN — that is the key-encryption check, not an error.',
          ] },
          { kind: 'p', text: 'Every transfer appears in Transaction History with its on-chain reference. If a send shows as submitted but has not landed, check the explorer for the transaction hash before retrying — a retry after a confirmed send is a genuine double payment.' },
          { kind: 'links', items: [
            { label: 'Open the wallet', href: '#/wallet' },
            { label: 'Transaction history', href: '#/transactions' },
            { label: 'Check a transaction in the explorer', href: '#/explorer' },
          ] },
        ],
      },
      {
        id: 'staking-rewards',
        title: 'Staking MLCNS and how rewards actually work',
        tags: ['staking', 'rewards', 'fees', 'validators', 'delegation'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'Staking locks MLCNS you control and, in return, routes you a share of the network\'s real transfer fees. There is no inflation reward — the yield comes from the 1% fee on every MLCNS transfer, split half to stakers and half to treasury.' },
          { kind: 'h', text: 'Two ways to stake' },
          { kind: 'list', items: [
            'Direct stake — bond your own MLCNS and receive a proportional cut of the staker share of fees.',
            'Delegation — add your stake behind a validator. You share in that validator\'s rewards minus its commission; the validator earns for running infrastructure, you earn without running anything.',
          ] },
          { kind: 'note', tone: 'info', text: 'Rewards scale with network activity. A quiet hour pays less than a busy one — that is expected, not a bug.' },
          { kind: 'p', text: 'Unstaking releases your tokens after the unbonding period shown in the staking screen. Plan cash-outs around it: MLCNS still unbonding cannot be sent or converted.' },
          { kind: 'links', items: [{ label: 'Open staking', href: '#/staking' }] },
        ],
      },
    ],
  },
  {
    id: 'money',
    icon: '📲',
    name: 'Buying & cashing out',
    blurb: 'M-Pesa rails: buying Mallpoints, converting, and cashing out to KES.',
    articles: [
      {
        id: 'buy-mlpts-mpesa',
        title: 'Buying Mallpoints with M-Pesa',
        tags: ['mpesa', 'buy', 'purchase', 'stk push', 'kes'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'Mallpoints are purchased with Kenyan Shillings over M-Pesa at a fixed peg of KES 2 per MLPTS. The flow is quote-first, so you always confirm the exact amount before money moves.' },
          { kind: 'h', text: 'The flow' },
          { kind: 'list', items: [
            'Enter the KES amount on the Purchase page — the equivalent MLPTS is shown before you commit.',
            'Confirm, then complete the STK push prompt that appears on your phone. The payment goes through Safaricom; the platform never sees your M-Pesa PIN.',
            'MLPTS credits once Safaricom confirms the payment — usually seconds, occasionally a minute or two during busy periods.',
          ] },
          { kind: 'note', tone: 'info', text: 'Purchases feed the platform\'s liquidity pool. If the pool has reached its cap, direct purchases pause until it drains — the page will say so explicitly rather than taking your money and stalling.' },
          { kind: 'links', items: [{ label: 'Purchase Mallpoints', href: '#/mallpoints-purchase' }] },
        ],
      },
      {
        id: 'convert-mlpts',
        title: 'Converting MLPTS to MLCNS',
        tags: ['convert', 'conversion', 'rate', 'oracle', 'burn', 'mint'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'Conversion is the bridge from earned points to a transferable token: your MLPTS are burned (destroyed, permanently) and MLCNS is minted in their place at the current rate.' },
          { kind: 'h', text: 'How the rate is set' },
          { kind: 'p', text: 'The rate is dynamic, not hardcoded. A fiat-pegged oracle publishes it from KES reference prices, with hard bounds enforced on-chain so the rate cannot drift outside a sane corridor even if a price feed misbehaves. The exact rate is shown on the conversion screen before you confirm — read it, because the number you confirm is the number you get.' },
          { kind: 'h', text: 'What to expect' },
          { kind: 'list', items: [
            'The conversion is a signed on-chain transaction — it appears in your transaction history like any other transfer.',
            'Converted MLCNS lands in your wallet balance; the burned MLPTS are gone and cannot be restored.',
            'If a conversion is rejected, check that your wallet is set up and your MLPTS balance covers the amount — points already converted cannot be converted twice.',
          ] },
          { kind: 'links', items: [{ label: 'Convert in the wallet', href: '#/wallet' }] },
        ],
      },
      {
        id: 'cash-out',
        title: 'Cashing out MLCNS to KES',
        tags: ['withdraw', 'cash out', 'mpesa', 'payout', 'review'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'Cashing out runs the buy flow in reverse: your MLCNS is burned on-chain first, then a KES payout is sent to your registered M-Pesa number.' },
          { kind: 'h', text: 'How it works' },
          { kind: 'list', items: [
            'Request the payout from the withdraw screen and confirm the burn with your PIN.',
            'The burn is an on-chain transaction — if it fails, nothing has been deducted; retry when the issue is resolved.',
            'Once the burn confirms, the payout is dispatched to M-Pesa. Small amounts usually arrive quickly.',
          ] },
          { kind: 'note', tone: 'warn', text: 'Large amounts may be held for a manual compliance review before the payout is sent. This is normal for financial platforms — the hold is on the payout, and the notification center tells you when it clears.' },
          { kind: 'links', items: [
            { label: 'Withdraw screen', href: '#/wallet' },
            { label: 'Identity verification (required for larger cash-outs)', href: '#/kyc' },
          ] },
        ],
      },
    ],
  },
  {
    id: 'mines',
    icon: '⛏',
    name: 'Mines: tasks & rewards',
    blurb: 'Earning MLPTS, how review works, and what to do after a rejection.',
    articles: [
      {
        id: 'earn-mlpts',
        title: 'Earning MLPTS as a Campaign Participant',
        tags: ['tasks', 'campaigns', 'earn', 'submission', 'proof'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'Mines is the platform\'s task system (the name has nothing to do with mining hardware — the chain itself does not use proof-of-work). Brands and creators run campaigns; you complete their tasks and submit proof of completion; approved work pays MLPTS.' },
          { kind: 'h', text: 'The loop' },
          { kind: 'list', items: [
            'Find a campaign whose task you can genuinely complete — engagement tasks must be real, and reviewers check.',
            'Do the task outside the app, then submit your proof (links, screenshots, whatever the task asks for) from the campaign page.',
            'Your submission goes to a review panel. You do not pick the reviewers, and they do not know it is you.',
            'Once approved, MLPTS credits to your account. Remember: a wallet is required before anything can pay out.',
          ] },
          { kind: 'note', tone: 'warn', text: 'Submitted proof is reviewed by other users. Fabricated engagement is the most common reason submissions are rejected — and rejection is visible on your record.' },
          { kind: 'links', items: [
            { label: 'Browse campaigns', href: '#/mines' },
            { label: 'How submission review works', cat: 'mines', art: 'how-review-works' },
          ] },
        ],
      },
      {
        id: 'how-review-works',
        title: 'How submission review works (and why some votes weigh more)',
        tags: ['review', 'reviewers', 'reputation', 'vote', 'approval', 'stake'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'Every submission is reviewed by a random panel of six reviewers from the pool of Proof Validators. Their votes are not counted equally — each vote is weighted by the reviewer\'s reputation score, a 0–100 number that starts at 50.' },
          { kind: 'h', text: 'The decision rule' },
          { kind: 'list', items: [
            'Each of the six reviewers votes approve or reject within the review window.',
            'Votes are summed by reputation weight, not by headcount. A submission is approved once the weighted "yes" total clears 60% of all weight cast.',
            'Reviewers who never show up to vote lose reputation over time. Three consecutive no-shows suspends their reviewer stake — the system is designed so that holding the role requires actually reviewing.',
          ] },
          { kind: 'p', text: 'Why weighting? Because it makes drive-by voting expensive. A reviewer with a track record of careful, responsive decisions carries more influence than a fresh or neglectful one, which is exactly the direction trust should flow.' },
          { kind: 'note', tone: 'info', text: 'Reviewers and the chain\'s validators are completely different things. See the guides under Validators & consensus for the block-production kind.' },
        ],
      },
      {
        id: 'appeal-rejection',
        title: 'Your submission was rejected — how to appeal',
        tags: ['rejection', 'appeal', 'resubmit', 'my tasks'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'A rejection is not always the end of a submission — every rejection is appealable exactly once. One appeal, not a loop: read the review outcome carefully before spending yours.' },
          { kind: 'h', text: 'How to appeal' },
          { kind: 'list', items: [
            'Open My Tasks and find the rejected submission — the review outcome shows alongside it.',
            'Resubmit from the submission card. If the rejection was for weak or unverifiable proof, strengthen the proof before resubmitting — the appeal goes back through the same review process.',
            'If the appeal is also rejected, the decision stands. Re-submitting identical work through a new campaign will not fare better.',
          ] },
          { kind: 'note', tone: 'info', text: 'Rejected means the work did not pass review — your account is not penalized for appealing honestly. Penalized accounts are a separate thing entirely (see the frozen-account guide).' },
          { kind: 'links', items: [{ label: 'Open My Tasks', href: '#/mines' }] },
        ],
      },
    ],
  },
  {
    id: 'marketplace',
    icon: '🛒',
    name: 'Marketplace & escrow',
    blurb: 'How on-chain escrow protects buyers and sellers, and what disputes do.',
    articles: [
      {
        id: 'escrow-explained',
        title: 'How escrow protects a marketplace purchase',
        tags: ['escrow', 'purchase', 'release', 'refund', 'safety'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'When you buy something through the marketplace, your funds do not go to the seller. They move into an on-chain escrow contract and are held there until the deal resolves. Neither party can walk away with both sides of the trade.' },
          { kind: 'h', text: 'The possible endings' },
          { kind: 'list', items: [
            'Release — you, the buyer, confirm you got what you paid for. Only the buyer can trigger this.',
            'Refund — the seller cancels the deal and returns your funds. Only the seller can trigger this.',
            'Dispute — something is wrong. You freeze the escrow during its dispute window and a resolution follows, rather than an autopilot release.',
          ] },
          { kind: 'p', text: 'Every action — creating the escrow, releasing, refunding, disputing — is validated on-chain before anything moves: real addresses, a positive amount, a real escrow reference. Malformed requests are rejected before they ever touch a balance.' },
          { kind: 'note', tone: 'ok', text: 'Release only when you actually have what you paid for. After a release the funds are gone — escrow protects the deal, it cannot reverse your own confirmation.' },
          { kind: 'links', items: [{ label: 'Open the marketplace', href: '#/marketplace' }] },
        ],
      },
      {
        id: 'marketplace-dispute',
        title: 'Opening a dispute on an escrow',
        tags: ['dispute', 'escrow', 'frozen', 'window'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'A dispute freezes an active escrow so that neither a release nor a refund can complete while the problem is worked out. Use it when the deal is genuinely stuck — a seller who cannot deliver, goods that do not match the listing — not as a negotiating tactic: the freeze is visible to the other party.' },
          { kind: 'h', text: 'What matters' },
          { kind: 'list', items: [
            'Disputes must be opened during the escrow\'s dispute window, shown on the escrow record. After the window closes, only release and refund remain.',
            'While disputed, the funds are locked on-chain — the seller cannot refund and you cannot release, so the money is safe from both sides until resolution.',
            'Keep your own records (screenshots, messages) from before you open the dispute; you will want them if the disagreement escalates.',
          ] },
          { kind: 'links', items: [{ label: 'Your marketplace activity', href: '#/marketplace' }] },
        ],
      },
    ],
  },
  {
    id: 'kyc',
    icon: '🛡',
    name: 'Verification (KYC)',
    blurb: 'Starting identity verification, statuses, rejections, and data handling.',
    articles: [
      {
        id: 'start-kyc',
        title: 'Starting identity verification — what you need',
        tags: ['kyc', 'verification', 'identity', 'document', 'id'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'Some actions — larger buys and cash-outs in particular — require identity verification for regulatory compliance. Verification is a guided wizard that takes about five minutes, and you can leave and come back: your progress is saved as a draft after each step.' },
          { kind: 'h', text: 'What to have ready' },
          { kind: 'list', items: [
            'A valid government-issued ID — passport, driver\'s license, or national ID.',
            'A photo or scan of that document: PNG, JPG, or PDF, up to 10 MB.',
            'Your personal details: legal name, date of birth, address, and phone number as they appear on official records.',
          ] },
          { kind: 'h', text: 'The five steps' },
          { kind: 'list', items: [
            'About you — legal name, date of birth, nationality.',
            'Address & contact — residential address and phone number.',
            'ID document — ID type, number, expiry, and the document upload.',
            'Financial profile — occupation, source of funds, income range. Source of funds is a standard compliance question, not a judgment.',
            'Review & submit — check every field, tick the declaration, submit.',
          ] },
          { kind: 'note', tone: 'info', text: 'Drafts save automatically as you type. Close the tab mid-wizard and the session resumes where you left it.' },
          { kind: 'links', items: [{ label: 'Start verification', href: '#/kyc' }] },
        ],
      },
      {
        id: 'kyc-status',
        title: 'KYC statuses explained',
        tags: ['kyc', 'status', 'pending', 'approved', 'review', 'draft'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'Verification requests move through a small set of states. Here is what each one means and what, if anything, you should do.' },
          { kind: 'list', items: [
            'Not submitted — you have not started. The verification wizard is the place to begin.',
            'Draft — you started but have not submitted. Nothing is under review yet; resume the wizard to finish.',
            'Under review — submitted and with the compliance team. No action needed; you can keep using the platform while you wait. Most reviews finish within one business day.',
            'Approved — you are verified. The gate disappears and higher limits unlock.',
            'Rejected — the review could not approve your submission. The rejection includes notes; see the resubmission guide.',
          ] },
          { kind: 'note', tone: 'info', text: 'While a submission is under review, the in-app banner changes from "KYC required" to a non-blocking "under review" notice — you are not locked out of the rest of the platform while you wait.' },
          { kind: 'links', items: [
            { label: 'Check your verification status', href: '#/kyc' },
            { label: 'Verification rejected — how to resubmit', cat: 'kyc', art: 'kyc-rejected' },
          ] },
        ],
      },
      {
        id: 'kyc-rejected',
        title: 'Verification rejected — how to resubmit',
        tags: ['kyc', 'rejected', 'resubmit', 'notes'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'A rejection means the review could not verify you from what was submitted — not that you are banned. Every rejection comes with notes explaining what fell short, and resubmission is always open.' },
          { kind: 'h', text: 'Common reasons and fixes' },
          { kind: 'list', items: [
            'Document unreadable — re-upload a sharper photo or scan; glare, cut edges, and low light are the usual culprits.',
            'Document expired — the expiry date on the ID must be in the future.',
            'Details mismatch — the name and date of birth on the form must match the document. "Test User" is not going to pass; use your legal details.',
            'Missing or ineligible document — a library card is not a government ID. Use passport, driver\'s license, or national ID.',
          ] },
          { kind: 'p', text: 'To resubmit, open the verification wizard, read the notes shown at the top, correct the flagged fields, and submit again. A fresh review starts from your new submission.' },
          { kind: 'links', items: [{ label: 'Open verification', href: '#/kyc' }] },
        ],
      },
      {
        id: 'kyc-data',
        title: 'How your verification data is handled',
        tags: ['kyc', 'privacy', 'encryption', 'pii', 'retention'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'Verification means handing over sensitive documents, so here is plainly what happens to them.' },
          { kind: 'list', items: [
            'Personal details and ID documents are encrypted at rest — stored as ciphertext, not readable plaintext in a database.',
            'They are used for the compliance review and nothing else. They are not sold, shared with other users, or attached to your public profile.',
            'Your uploaded document is fetched through an authenticated, access-controlled link — it is never a public URL.',
            'Records are retained in line with financial-compliance requirements. Erasing your account anonymizes your personal details (see the data export guide), but redacted financial records may be retained as the law requires.',
          ] },
          { kind: 'note', tone: 'ok', text: 'Nobody legitimate will ever ask you to send your ID document by email, chat, or DM. The only place it belongs is the verification wizard itself.' },
          { kind: 'links', items: [
            { label: 'Start verification', href: '#/kyc' },
            { label: 'Exporting or deleting your data', cat: 'security', art: 'data-export' },
          ] },
        ],
      },
    ],
  },
  {
    id: 'security',
    icon: '🔐',
    name: 'Security & privacy',
    blurb: 'Recovery phrases, PINs, 2FA, sessions, and your data rights.',
    articles: [
      {
        id: 'recovery-phrase',
        title: 'Your recovery phrase — what it is and who to share it with',
        tags: ['recovery phrase', 'mnemonic', 'seed', 'security', 'backup'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'Your recovery phrase is the master key to your wallet: 24 words from which your keys are derived. Anyone who has it can move your funds, from anywhere, with nothing but the words. That is the whole threat model — protect the phrase and you have protected the wallet.' },
          { kind: 'h', text: 'The rules' },
          { kind: 'list', items: [
            'It is shown exactly once, at wallet creation. Write it on paper and store it somewhere safe. Screenshots and cloud notes are how phrases leak.',
            'We never ask for it — not by email, not in chat, not in a support ticket. A message asking for your phrase is a scam, full stop.',
            'No one can recover it for you. There is no central copy, which is the same property that stops us from spending your funds: nobody can, including us.',
          ] },
          { kind: 'note', tone: 'warn', text: 'The only place a recovery phrase is ever entered is your own wallet app at restore time. If a site wants your phrase to "verify", "sync", or "unlock" anything, it is stealing it.' },
          { kind: 'links', items: [
            { label: 'PIN, 2FA and sessions', cat: 'security', art: 'pin-2fa' },
            { label: 'Security settings', href: '#/security' },
          ] },
        ],
      },
      {
        id: 'pin-2fa',
        title: 'PIN, two-factor authentication, and active sessions',
        tags: ['pin', '2fa', 'sessions', 'login activity', 'security'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'Three layers protect an account day to day, and all three live in Settings and Security Settings.' },
          { kind: 'h', text: 'Vault PIN' },
          { kind: 'p', text: 'The PIN encrypts your wallet keys at rest. Signing a transaction or exporting a key re-prompts for it, so someone at your unlocked browser still cannot move funds without the PIN. It also rate-limits guesses — a handful of wrong attempts locks retries for a cooldown.' },
          { kind: 'h', text: 'Two-factor authentication' },
          { kind: 'p', text: '2FA adds a second, time-based code at sign-in. Turn it on in Security Settings and store the backup codes somewhere that is not the same place as your recovery phrase — if you lose both at once, you lose the account.' },
          { kind: 'h', text: 'Sessions and login activity' },
          { kind: 'p', text: 'Settings shows every active session (device, time) and a login-activity history. See a session you do not recognize? Revoke it there — revocation kills the token immediately, and the unrecognized login will be visible in the activity log with its details.' },
          { kind: 'links', items: [
            { label: 'Security settings', href: '#/security' },
            { label: 'Profile & settings', href: '#/settings' },
          ] },
        ],
      },
      {
        id: 'data-export',
        title: 'Exporting or deleting your data',
        tags: ['export', 'erasure', 'gdpr', 'privacy', 'delete account'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'Your data is yours. Both levers are in Security Settings and both are real — they act on the account record, not just the screen.' },
          { kind: 'h', text: 'Export' },
          { kind: 'p', text: 'Download a full export of everything linked to your account: profile, settings, transaction references, task history. The export is machine-readable so you can take it to another service or keep it for your own records.' },
          { kind: 'h', text: 'Erasure' },
          { kind: 'p', text: 'Requesting permanent erasure anonymizes your account and personal details immediately. Two honest caveats: some financial records are retained in redacted form as required for fraud and compliance record-keeping — the law does not allow a full wipe of transaction history — and erasure does not put MLCNS back if you still hold any, so move funds out first.' },
          { kind: 'note', tone: 'warn', text: 'Erasure is immediate and not reversible. Export first, always.' },
          { kind: 'links', items: [{ label: 'Security settings', href: '#/security' }] },
        ],
      },
      {
        id: 'account-frozen',
        title: 'My account shows as frozen — what does that mean?',
        tags: ['frozen', 'suspended', 'restricted', 'review'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'A frozen account is one an administrator has restricted, usually pending a fraud or policy review. Most actions are blocked while frozen — sending, earning, converting — but your balances are untouched and nothing is being deleted.' },
          { kind: 'h', text: 'What to do' },
          { kind: 'list', items: [
            'Do not try to route around it with a second account. Duplicate accounts during a review make the outcome worse, not better.',
            'Gather context: what were you doing when it froze? Unusual patterns — rapid trading, repeated failed tasks, logins from many countries — are typical triggers.',
            'Use the in-app channels to reach support and ask for the reason. If the freeze was a mistake, a clear explanation plus evidence usually resolves it.',
          ] },
          { kind: 'note', tone: 'info', text: 'Freezes are precautionary by design — they pause activity while a human looks, rather than letting possible fraud continue during the look.' },
        ],
      },
    ],
  },
  {
    id: 'troubleshooting',
    icon: '🧰',
    name: 'Troubleshooting',
    blurb: 'Paused features, notifications, and checking on the chain itself.',
    articles: [
      {
        id: 'feature-paused',
        title: 'Why is a feature showing "temporarily paused"?',
        tags: ['paused', 'maintenance', 'maintenance mode', 'incident'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'A "temporarily paused" banner means maintenance mode is active for that specific feature. It is a deliberate, brief pause — typically during an incident or an upstream provider issue — not something wrong with your account, and not a platform-wide outage.' },
          { kind: 'h', text: 'What it means in practice' },
          { kind: 'list', items: [
            'The pause is per feature: staking can be paused while the marketplace runs normally.',
            'Your funds and history are unaffected — a pause stops new activity, it does not touch existing balances.',
            'Check back shortly. Pauses exist precisely so fixes can land without half-completed operations, which is better for everyone than letting a broken feature keep taking actions.',
          ] },
        ],
      },
      {
        id: 'notifications-channels',
        title: 'Notification channels: in-app, email, SMS, and WhatsApp',
        tags: ['notifications', 'email', 'sms', 'whatsapp', 'channels'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'Transaction and account notifications can reach you four ways, and each channel is toggled independently in Settings → Notifications, so you can keep, say, security alerts on SMS while silencing marketing email.' },
          { kind: 'h', text: 'Where things land' },
          { kind: 'list', items: [
            'In-app — always on. The bell in the top bar and the Notifications page are the source of truth; every other channel mirrors what appears there.',
            'Email — transaction receipts and review outcomes. Marketing email has its own unsubscribe, separate from transactional mail.',
            'SMS / WhatsApp — configured for time-sensitive events. WhatsApp requires the number to have opted in to the service.',
          ] },
          { kind: 'note', tone: 'info', text: 'Not receiving an expected notification? Check the channel toggles first — a disabled channel silently swallows everything sent to it.' },
          { kind: 'links', items: [
            { label: 'Notifications page', href: '#/notifications' },
            { label: 'Notification settings', href: '#/settings' },
          ] },
        ],
      },
      {
        id: 'chain-status',
        title: 'Checking chain status and a "stuck" transaction',
        tags: ['explorer', 'chain', 'status', 'stuck', 'transaction', 'validators'],
        updated: UPDATED,
        body: [
          { kind: 'p', text: 'Everything the platform does on-chain is public. Before assuming something is broken, the explorer tells you the truth faster than support can.' },
          { kind: 'h', text: 'Reading the signs' },
          { kind: 'list', items: [
            'Explorer — shows the live chain: latest blocks, their height and time, and the validator set. If new blocks are appearing, the chain is healthy.',
            'Validators — who is currently bonded and signing. A validator that misses too many blocks gets jailed automatically; that is the consensus system working, not an outage.',
            'Transaction history — every action you take has a reference here. A transaction stuck between "submitted" and "confirmed" can be looked up by that reference in the explorer.',
          ] },
          { kind: 'p', text: 'If the chain is producing blocks and your transaction shows confirmed, but a balance looks stale, refresh — balances poll live while the page is open. If a transaction is genuinely absent from both history and explorer, it never made it: safe to retry.' },
          { kind: 'links', items: [
            { label: 'Open the explorer', href: '#/explorer' },
            { label: 'Your transaction history', href: '#/transactions' },
          ] },
        ],
      },
    ],
  },
];

const POPULAR = ['tokens-explained', 'buy-mlpts-mpesa', 'start-kyc', 'earn-mlpts', 'recovery-phrase', 'escrow-explained'];

const ALL_ARTICLES: { cat: HelpCategory; article: HelpArticle }[] = CATEGORIES.flatMap((cat) =>
  cat.articles.map((article) => ({ cat, article })),
);

function blockText(b: HelpBlock): string {
  if (b.kind === 'list') return b.items.join(' ');
  if (b.kind === 'links') return b.items.map((l) => l.label).join(' ');
  return b.text;
}

function findArticle(catId: string, artId: string) {
  const cat = CATEGORIES.find((c) => c.id === catId);
  const article = cat?.articles.find((a) => a.id === artId);
  return cat && article ? { cat, article } : null;
}

function Block({ b, onOpen }: { b: HelpBlock; onOpen: (catId: string, artId: string) => void }) {
  switch (b.kind) {
    case 'p':
      return <p className="hc-p">{b.text}</p>;
    case 'h':
      return <h3 className="hc-h">{b.text}</h3>;
    case 'list':
      return (
        <ul className="hc-list">
          {b.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );
    case 'note':
      return <div className={`hc-note hc-note-${b.tone}`}>{b.text}</div>;
    case 'links':
      return (
        <div className="hc-links">
          {b.items.map((l) =>
            l.cat && l.art ? (
              <button key={l.label} className="hc-link-chip" onClick={() => onOpen(l.cat!, l.art!)}>{l.label} →</button>
            ) : (
              <a key={l.label} className="hc-link-chip" href={l.href}>{l.label} →</a>
            ),
          )}
        </div>
      );
  }
}

export function HelpCenter() {
  const [query, setQuery] = useState('');
  const [catId, setCatId] = useState<string | null>(null);
  const [artId, setArtId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (q.length < 2) return [];
    return ALL_ARTICLES.filter(({ cat, article }) =>
      `${article.title} ${article.tags.join(' ')} ${cat.name} ${article.body.map(blockText).join(' ')}`
        .toLowerCase()
        .includes(q),
    );
  }, [q]);

  const openArticle = (cid: string, aid: string) => {
    setCatId(cid);
    setArtId(aid);
    window.scrollTo({ top: 0 });
  };
  const openCategory = (cid: string) => {
    setCatId(cid);
    setArtId(null);
    window.scrollTo({ top: 0 });
  };
  const goHome = () => {
    setCatId(null);
    setArtId(null);
    window.scrollTo({ top: 0 });
  };

  const current = artId && catId ? findArticle(catId, artId) : null;

  /* ── Article view ─────────────────────────────────────────── */
  if (current) {
    const { cat, article } = current;
    const idx = cat.articles.findIndex((a) => a.id === article.id);
    const prev = cat.articles[idx - 1];
    const next = cat.articles[idx + 1];
    return (
      <div className="hc">
        <div className="hc-crumb">
          <button className="hc-crumb-link" onClick={goHome}>Help Center</button>
          <span className="hc-crumb-sep">›</span>
          <button className="hc-crumb-link" onClick={() => openCategory(cat.id)}>{cat.name}</button>
          <span className="hc-crumb-sep">›</span>
          <span className="hc-crumb-here">{article.title}</span>
        </div>
        <article className="hc-article card card-glow bg-gradient-card">
          <div className="hc-article-head">
            <span className="hc-cat-icon">{cat.icon}</span>
            <div>
              <h1 className="hc-article-title">{article.title}</h1>
              <div className="hc-article-meta">
                {cat.name} · Updated {article.updated}
              </div>
            </div>
          </div>
          <div className="hc-article-body">
            {article.body.map((b, i) => (
              <Block key={i} b={b} onOpen={openArticle} />
            ))}
          </div>
          <div className="hc-article-nav">
            {prev ? (
              <button className="hc-nav-btn" onClick={() => openArticle(cat.id, prev.id)}>← {prev.title}</button>
            ) : <span />}
            {next ? (
              <button className="hc-nav-btn hc-nav-next" onClick={() => openArticle(cat.id, next.id)}>{next.title} →</button>
            ) : <span />}
          </div>
        </article>
        <HelpContact />
      </div>
    );
  }

  /* ── Category view ────────────────────────────────────────── */
  if (catId) {
    const cat = CATEGORIES.find((c) => c.id === catId);
    if (cat) {
      return (
        <div className="hc">
          <div className="hc-crumb">
            <button className="hc-crumb-link" onClick={goHome}>Help Center</button>
            <span className="hc-crumb-sep">›</span>
            <span className="hc-crumb-here">{cat.name}</span>
          </div>
          <div className="view-head">
            <h1 className="text-gradient"><span className="hc-cat-icon hc-cat-icon-lg">{cat.icon}</span> {cat.name}</h1>
            <span className="sub">{cat.blurb}</span>
          </div>
          <div className="stagger">
            {cat.articles.map((a) => (
              <button key={a.id} className="hc-article-row card card-glow bg-gradient-card card-hover" onClick={() => openArticle(cat.id, a.id)}>
                <div className="grow">
                  <div className="hc-row-title">{a.title}</div>
                  <div className="tiny muted">{a.tags.slice(0, 4).map((t) => `#${t}`).join('  ')}</div>
                </div>
                <span className="hc-row-updated">Updated {a.updated}</span>
                <span className="hc-row-arrow">→</span>
              </button>
            ))}
          </div>
          <HelpContact />
        </div>
      );
    }
  }

  /* ── Home / search view ───────────────────────────────────── */
  const popular = POPULAR
    .map((id) => ALL_ARTICLES.find((x) => x.article.id === id))
    .filter((x): x is { cat: HelpCategory; article: HelpArticle } => !!x);

  return (
    <div className="hc">
      <div className="view-head">
        <h1 className="text-gradient">Help Center</h1>
        <span className="sub">{ALL_ARTICLES.length} guides across {CATEGORIES.length} topics — real answers, written for how Mallchain actually works</span>
      </div>

      <div className="hc-search-wrap">
        <span className="hc-search-ico">🔍</span>
        <input
          ref={searchRef}
          className="hc-search"
          type="search"
          placeholder="Search the guides — try “M-Pesa”, “recovery phrase”, “rejected”…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="hc-search-clear" onClick={() => setQuery('')} aria-label="Clear search">✕</button>
        )}
      </div>

      {q.length >= 2 ? (
        <div className="stagger">
          <div className="tiny muted" style={{ margin: '4px 0 10px' }}>
            {results.length} result{results.length === 1 ? '' : 's'} for “{query.trim()}”
          </div>
          {results.map(({ cat, article }) => (
            <button key={`${cat.id}-${article.id}`} className="hc-article-row card card-glow bg-gradient-card card-hover" onClick={() => openArticle(cat.id, article.id)}>
              <span className="hc-cat-icon">{cat.icon}</span>
              <div className="grow">
                <div className="hc-row-title">{article.title}</div>
                <div className="tiny muted">{cat.name} · {article.tags.slice(0, 3).map((t) => `#${t}`).join('  ')}</div>
              </div>
              <span className="hc-row-arrow">→</span>
            </button>
          ))}
          {results.length === 0 && (
            <div className="empty-state">
              <div className="es-ico">🔍</div>
              <div className="es-t">No guides match that search</div>
              <div className="es-m">Try a shorter or different word — or browse the topics below.</div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="hc-section-label">Popular guides</div>
          <div className="hc-popular">
            {popular.map(({ cat, article }) => (
              <button key={article.id} className="hc-pop-card card card-glow card-hover" onClick={() => openArticle(cat.id, article.id)}>
                <span className="hc-cat-icon">{cat.icon}</span>
                <div className="hc-row-title">{article.title}</div>
              </button>
            ))}
          </div>

          <div className="hc-section-label">Browse by topic</div>
          <div className="hc-cats">
            {CATEGORIES.map((cat) => (
              <button key={cat.id} className="hc-cat-card card card-glow card-hover" onClick={() => openCategory(cat.id)}>
                <div className="hc-cat-head">
                  <span className="hc-cat-icon hc-cat-icon-lg">{cat.icon}</span>
                  <b>{cat.name}</b>
                </div>
                <div className="tiny muted">{cat.blurb}</div>
                <div className="hc-cat-count">{cat.articles.length} guide{cat.articles.length === 1 ? '' : 's'}</div>
              </button>
            ))}
          </div>
        </>
      )}

      <HelpContact />
    </div>
  );
}

function HelpContact() {
  return (
    <div className="hc-contact card card-glow bg-gradient-card">
      <div>
        <b>Still stuck?</b>
        <div className="tiny muted">Check the chain live, your history, or tune how we reach you — these all go to the real tools, not a form that goes nowhere.</div>
      </div>
      <div className="hc-contact-links">
        <a className="hc-link-chip" href="#/explorer">🔍 Chain status</a>
        <a className="hc-link-chip" href="#/transactions">📄 My transactions</a>
        <a className="hc-link-chip" href="#/notifications">🔔 Notifications</a>
        <a className="hc-link-chip" href="#/settings">⚙ Settings</a>
      </div>
    </div>
  );
}

export default HelpCenter;
