// Social links and support config.
// This is the ONE place to update GitHub, LinkedIn, and UPI references.
// Components read from here; nothing is scattered across JSX.

export const SOCIAL = {
  /** Creator GitHub profile — "Made with ❤️ by Harsh" links here */
  githubProfile: "https://github.com/hrsvd",

  /** Project repository URL — "Star on GitHub" button target.
   *  Derived from the git remote (origin: git@github-personal:hrsvd/urbanlens.git). */
  githubProject: "https://github.com/hrsvd/urbanlens",

  /** LinkedIn profile URL — replace the placeholder with the real URL */
  linkedin: "https://www.linkedin.com/in/harshvardhansingh-in/",

  /** Absolute path inside /public for the UPI QR code image.
   *  Drop the real image at public/support/upi-qr.png to activate it.
   *  While the file is absent, the UI shows a "QR coming soon" slot. */
  upiQrImagePath: "/support/upi-qr.png",
} as const;
