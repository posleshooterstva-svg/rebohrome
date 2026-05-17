export type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDocument = {
  title: string;
  lastUpdated: string;
  intro?: string[];
  sections: LegalSection[];
};

export const GLOBAL_COLLECTIBLE_DISCLAIMER =
  "ReboHrome collectibles are intended for entertainment and collector purposes only and are not securities, investments, or financial products.";

export const WITHDRAWAL_POLICY_SUMMARY = [
  "Withdrawals are processed manually through USDT BEP20.",
  "Minimum withdrawal amount is $500.",
  "Requests are reviewed in 1–5 business days.",
  "Fraud, abuse, and compliance checks may delay or reject a request.",
];

export const privacyPolicyDocument: LegalDocument = {
  title: "Privacy Policy",
  lastUpdated: "May 2026",
  intro: [
    "Welcome to ReboHrome.",
    "This Privacy Policy explains how ReboHrome collects, uses, stores, and protects user information when accessing the platform, marketplace services, collectible archives, and related features.",
    "By using ReboHrome, you agree to the practices described in this policy.",
  ],
  sections: [
    {
      title: "1. Information We Collect",
      bullets: [
        "Username",
        "Telegram username",
        "Password credentials (securely hashed)",
        "Account transaction history",
        "Deposit and withdrawal activity",
        "Order history",
        "Payment metadata",
        "Device/browser information",
        "IP address",
        "Session and authentication data",
        "Cookies and analytics information",
      ],
      paragraphs: [
        "ReboHrome does NOT store full payment card information on its own servers.",
        "Payments are processed through third-party payment providers.",
      ],
    },
    {
      title: "2. How We Use Your Data",
      bullets: [
        "Provide marketplace functionality",
        "Process transactions",
        "Secure user accounts",
        "Prevent fraud and abuse",
        "Maintain transaction history",
        "Send transactional notifications",
        "Improve platform performance",
        "Monitor suspicious activity",
        "Comply with legal and payment provider obligations",
      ],
    },
    {
      title: "3. Telegram Integration",
      paragraphs: [
        "Users are required to provide a Telegram username during registration.",
        "Telegram usernames may be used for withdrawal verification, transaction linking, support communication, fraud prevention, and account recovery assistance.",
      ],
    },
    {
      title: "4. Transaction Monitoring",
      paragraphs: [
        "ReboHrome monitors transactions for fraud prevention, abuse detection, suspicious activity, and unauthorized payment behavior.",
        "ReboHrome reserves the right to temporarily restrict or review accounts involved in suspicious activity.",
      ],
    },
    {
      title: "5. AML / KYC Compliance",
      paragraphs: [
        "ReboHrome reserves the right to request identity verification in cases involving fraud prevention, payment disputes, suspicious transactions, compliance obligations, and anti-money laundering reviews.",
        "Failure to cooperate with compliance requests may result in account restrictions.",
      ],
    },
    {
      title: "6. Cookies & Analytics",
      paragraphs: [
        "ReboHrome uses cookies, session storage, analytics technologies, and security tracking systems.",
        "These technologies help improve authentication, user experience, security, and performance.",
      ],
    },
    {
      title: "7. Account Security",
      paragraphs: [
        "Passwords are securely hashed and protected using industry-standard security practices.",
        "Users are responsible for maintaining password confidentiality, protecting account access, and monitoring account activity.",
      ],
    },
    {
      title: "8. Data Retention",
      paragraphs: [
        "ReboHrome may retain account and transaction information for compliance, fraud prevention, dispute resolution, and legal obligations.",
      ],
    },
    {
      title: "9. Third-Party Services",
      paragraphs: [
        "ReboHrome may use third-party providers including payment processors, analytics services, cloud infrastructure, and communication systems.",
        "These providers may process limited data necessary for platform operation.",
      ],
    },
    {
      title: "10. User Rights",
      paragraphs: [
        "Users may request account updates, password changes, account deletion requests, and support assistance.",
        "Some transaction data may be retained for legal or compliance reasons.",
      ],
    },
    {
      title: "11. Age Restriction",
      paragraphs: ["ReboHrome is intended only for users aged 18 years or older."],
    },
    {
      title: "12. Contact",
      paragraphs: [
        "Support Email: support@rebohrome.com",
        "Telegram: @rebohrome",
      ],
    },
    {
      title: "13. Policy Changes",
      paragraphs: [
        "ReboHrome may update this Privacy Policy at any time.",
        "Continued platform usage constitutes acceptance of updated terms.",
      ],
    },
  ],
};

export const termsDocument: LegalDocument = {
  title: "Terms of Service",
  lastUpdated: "May 2026",
  intro: [
    "By accessing or using ReboHrome, you agree to these Terms of Service.",
    "If you do not agree, you must not use the platform.",
  ],
  sections: [
    {
      title: "1. Platform Description",
      paragraphs: ["ReboHrome is a digital collectible marketplace offering:"],
      bullets: [
        "collectible archive ownership",
        "digital collectible cards",
        "collector account systems",
        "vault balance functionality",
        "marketplace transactions",
      ],
    },
    {
      title: "2. Digital Goods",
      paragraphs: [
        "Products sold on ReboHrome are digital collectible items intended for entertainment, collecting, and archive ownership experiences.",
        "ReboHrome collectibles are NOT securities, investments, or financial instruments.",
        "No guarantees of future value or appreciation are provided.",
      ],
    },
    {
      title: "3. Account Responsibility",
      paragraphs: ["Users are responsible for:"],
      bullets: [
        "maintaining account security",
        "protecting login credentials",
        "all activity occurring under their account",
      ],
    },
    {
      title: "Account Restrictions",
      bullets: [
        "share accounts",
        "abuse payment systems",
        "exploit bugs",
        "engage in fraud",
        "manipulate marketplace systems",
      ],
      paragraphs: ["Users may not:"],
    },
    {
      title: "4. Payments",
      paragraphs: ["Accepted payment methods may include:"],
      bullets: [
        "Apple Pay",
        "Google Pay",
        "Visa",
        "Mastercard",
        "American Express",
        "Discover",
        "cryptocurrency payments",
      ],
    },
    {
      title: "Payment Reviews",
      paragraphs: ["Transactions may be reviewed for security purposes."],
    },
    {
      title: "5. Deposits",
      paragraphs: [
        "Deposited balance may be used for marketplace purchases.",
        "ReboHrome reserves the right to delay deposits under review, reject suspicious transactions, and restrict fraudulent activity.",
      ],
    },
    {
      title: "6. Withdrawals",
      paragraphs: [
        "Withdrawals are processed manually, are available via USDT BEP20, require a minimum amount of $500, and may require security review.",
        "Estimated processing time is 1–5 business days.",
      ],
    },
    {
      title: "7. Refund Policy",
      paragraphs: [
        "Digital collectible items become non-refundable after successful delivery to the user account.",
        "Physical shipped items are non-refundable.",
        "Chargeback abuse or fraudulent disputes may result in account suspension, permanent restrictions, and withdrawal limitations.",
      ],
    },
    {
      title: "8. Shipping",
      paragraphs: [
        "Physical shipments may be available internationally.",
        "Estimated delivery time is 7–21 business days depending on destination.",
        "Customers are responsible for customs duties, import taxes, and local delivery regulations.",
      ],
    },
    {
      title: "9. Compliance",
      paragraphs: [
        "ReboHrome reserves the right to monitor transactions, review suspicious behavior, request identity verification, and comply with legal obligations.",
      ],
    },
    {
      title: "10. Termination",
      paragraphs: [
        "ReboHrome may suspend or terminate accounts involved in fraud, abuse, chargebacks, platform manipulation, or policy violations.",
      ],
    },
    {
      title: "11. Limitation of Liability",
      paragraphs: [
        'ReboHrome is provided "as is" without warranties of uninterrupted availability.',
        "Users assume responsibility for marketplace usage and purchasing decisions.",
      ],
    },
    {
      title: "12. Contact",
      paragraphs: [
        "Support Email: support@rebohrome.com",
        "Telegram: @rebohrome",
      ],
    },
  ],
};

export const refundPolicyDocument: LegalDocument = {
  title: "Refund & Shipping Policy",
  lastUpdated: "May 2026",
  sections: [
    {
      title: "Refunds",
      paragraphs: [
        "Due to the nature of digital collectible products, all successfully delivered digital items are final and non-refundable.",
        "Refunds may only be considered in limited cases involving duplicate payments, failed transactions, and technical delivery failures.",
        "Refund requests are reviewed manually.",
      ],
    },
    {
      title: "Physical Items",
      paragraphs: [
        "Physical shipped collectibles are non-refundable.",
        "Customers are responsible for shipping information accuracy, customs/import fees, and delivery availability in their region.",
      ],
    },
    {
      title: "Shipping",
      paragraphs: [
        "Estimated international delivery is 7–21 business days.",
        "Shipping times may vary depending on customs processing, regional delivery services, and destination country.",
      ],
    },
    {
      title: "Withdrawals",
      paragraphs: [
        "Withdrawals are manually reviewed, processed through USDT BEP20, and subject to fraud and compliance review.",
        "Minimum withdrawal amount is $500.",
        "Estimated processing time is 1–5 business days.",
      ],
    },
    {
      title: "Transaction Security",
      paragraphs: [
        "ReboHrome monitors transactions to help prevent fraud, unauthorized activity, abuse, and payment disputes.",
      ],
    },
    {
      title: "Agreement",
      paragraphs: [
        "By completing a purchase, deposit, or withdrawal request, users agree to platform rules, refund limitations, compliance procedures, and digital delivery conditions.",
      ],
    },
    {
      title: "Contact",
      paragraphs: [
        "Support Email: support@rebohrome.com",
        "Telegram: @rebohrome",
      ],
    },
  ],
};

export const complianceDocument: LegalDocument = {
  title: "Compliance / AML Notice",
  lastUpdated: "May 2026",
  intro: [
    "ReboHrome maintains a premium marketplace environment built on transaction integrity, account security, and responsible platform operations.",
  ],
  sections: [
    {
      title: "Anti-Fraud Monitoring",
      paragraphs: [
        "The platform monitors deposits, purchases, withdrawals, login activity, and payment attempts to help prevent fraud, abuse, and unauthorized use.",
      ],
    },
    {
      title: "Suspicious Activity Detection",
      paragraphs: [
        "Accounts, transactions, or withdrawal requests that appear inconsistent, abusive, or high-risk may be placed under review before completion.",
      ],
    },
    {
      title: "Transaction Reviews",
      paragraphs: [
        "ReboHrome may delay, reject, or manually review deposits, withdrawals, balance activity, and collectible transfers when additional verification is required.",
      ],
    },
    {
      title: "Identity Verification Rights",
      paragraphs: [
        "In limited situations involving compliance obligations, fraud prevention, disputes, suspicious activity, or payment provider requirements, ReboHrome may request identity verification or additional documentation.",
      ],
    },
    {
      title: "AML / KYC Readiness",
      paragraphs: [
        "The platform reserves the right to apply anti-money laundering, risk-screening, and know-your-customer controls when necessary to protect users, payment partners, and marketplace integrity.",
      ],
    },
    {
      title: "Withdrawal Controls",
      paragraphs: [
        "USDT BEP20 withdrawal requests are manually reviewed, require linked Telegram identity and payout wallet details, and may be declined if security or compliance requirements are not satisfied.",
      ],
    },
    {
      title: "Platform Security Monitoring",
      paragraphs: [
        "Session activity, device signals, IP information, transaction metadata, and account behavior may be logged for security, audit, and compliance support purposes.",
      ],
    },
    {
      title: "Support",
      paragraphs: [
        "Compliance-related questions may be directed to support@rebohrome.com or @rebohrome.",
      ],
    },
  ],
};
