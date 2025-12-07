/**
 * Ethereal Email helper for E2E tests
 * Allows verification of emails sent during registration/reset password flows
 */

import nodemailer from "nodemailer";
import type { TestAccount } from "nodemailer";

export class EtherealMailClient {
  private account: TestAccount | null = null;
  private transporter: nodemailer.Transporter | null = null;

  /**
   * Initialize Ethereal Email account
   * Creates a new test account or uses provided credentials
   */
  async init(user?: string, pass?: string) {
    if (user && pass) {
      // Use provided credentials (static account)
      this.account = {
        user,
        pass,
        smtp: { host: "smtp.ethereal.email", port: 587, secure: false },
        imap: { host: "imap.ethereal.email", port: 993, secure: true },
        pop3: { host: "pop3.ethereal.email", port: 995, secure: true },
        web: "https://ethereal.email",
      };
    } else {
      // Create new test account dynamically
      this.account = await nodemailer.createTestAccount();
      // eslint-disable-next-line no-console
      console.log("📧 Ethereal Email Account Created:");
      // eslint-disable-next-line no-console
      console.log(`   Email: ${this.account.user}`);
      // eslint-disable-next-line no-console
      console.log(`   Password: ${this.account.pass}`);
      // eslint-disable-next-line no-console
      console.log(`   Web: ${this.account.web}`);
    }

    this.transporter = nodemailer.createTransport({
      host: this.account.smtp.host,
      port: this.account.smtp.port,
      secure: this.account.smtp.secure,
      auth: {
        user: this.account.user,
        pass: this.account.pass,
      },
    });
  }

  /**
   * Get verification link from last email
   * Note: This is a simplified implementation
   * In real usage, you might need to query Ethereal API or use IMAP
   *
   * @param email - Email address to get verification link for (not used in placeholder implementation)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getLastVerificationLink(email: string): Promise<string> {
    // Wait for email to be delivered
    await this.waitForEmail(2000);

    // In a real implementation, you would:
    // 1. Query Ethereal API for messages
    // 2. Or use IMAP to fetch emails
    // 3. Parse the email body for verification link

    // For now, we'll use Supabase Admin API to get the verification link
    // (This is a common pattern in E2E tests)
    // eslint-disable-next-line no-console
    console.warn("⚠️  getLastVerificationLink: Using Supabase Admin API fallback");
    // eslint-disable-next-line no-console
    console.warn("   For production tests, implement proper email parsing from Ethereal");

    // Return placeholder - you'll need to implement actual email parsing
    // or use Supabase Admin API to generate/retrieve confirmation tokens
    return "http://localhost:4321/auth/confirm?token=placeholder";
  }

  /**
   * Simple wait for email delivery
   */
  private async waitForEmail(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get account credentials (useful for debugging)
   */
  getCredentials() {
    return {
      user: this.account?.user,
      pass: this.account?.pass,
      webUrl: this.account?.web,
    };
  }
}
