import { MarketingShell, useStudioHref } from "./chrome";

/*
 * Engineering-drafted privacy policy. Plain language on purpose; have a
 * lawyer review before relying on it for anything beyond the newsletter
 * consent flow. Update "Last updated" whenever the substance changes.
 */

const CONTACT_EMAIL = "hello@manatki.xyz";
const LAST_UPDATED = "August 2, 2026";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="landing-display mt-12 text-xl font-bold">{children}</h2>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 text-[15px] leading-relaxed text-[var(--landing-muted)]">
      {children}
    </p>
  );
}

export function PrivacyPage() {
  const studio = useStudioHref();

  return (
    <MarketingShell studio={studio}>
      <div className="mx-auto max-w-2xl px-6 py-20">
        <p className="landing-mono text-[11px] uppercase text-[var(--landing-gold)]">
          Legal
        </p>
        <h1 className="landing-display mt-4 text-4xl font-extrabold">
          Privacy policy
        </h1>
        <Paragraph>Last updated: {LAST_UPDATED}</Paragraph>

        <SectionHeading>Who we are</SectionHeading>
        <Paragraph>
          Manatki ("we") operates the presentation and marketing-asset studio at
          manatki.xyz. For any privacy question or request, contact{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
            {CONTACT_EMAIL}
          </a>
          .
        </Paragraph>

        <SectionHeading>What we store</SectionHeading>
        <Paragraph>
          When you create an account we store your email address, a display
          name, and authentication data (for GitHub sign-in, the identity GitHub
          shares with us). The content you create — decks, slides, design
          systems, uploaded assets, comments — is stored so the product can
          work. AI keys you add are stored encrypted and scoped to your account.
        </Paragraph>

        <SectionHeading>Newsletter</SectionHeading>
        <Paragraph>
          The newsletter is strictly opt-in and uses double opt-in: nothing is
          sent until you ask to subscribe and then confirm from the email we
          send you. Our lawful basis is your consent (GDPR Art. 6(1)(a)). We
          record what you consented to, when, and from which screen. You can
          withdraw at any time via the unsubscribe link in every email or the
          toggle in Settings → General — withdrawal is one click and never
          requires logging in. After you unsubscribe we keep a minimal
          suppression record (your address and the unsubscribe timestamp) so we
          never email you again by mistake.
        </Paragraph>

        <SectionHeading>Who processes data for us</SectionHeading>
        <Paragraph>
          We use Resend to deliver email, Neon to host our database, and Vercel
          to host the application and file storage. Each acts as a processor on
          our behalf. We do not sell personal data or share it with anyone for
          advertising.
        </Paragraph>

        <SectionHeading>Your rights</SectionHeading>
        <Paragraph>
          You can request access to, correction of, or deletion of your personal
          data, and you can withdraw any consent you have given, at any time.
          Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
            {CONTACT_EMAIL}
          </a>{" "}
          and we will respond within 30 days. If you believe we have handled
          your data improperly, you also have the right to lodge a complaint
          with your local data-protection authority.
        </Paragraph>
      </div>
    </MarketingShell>
  );
}
