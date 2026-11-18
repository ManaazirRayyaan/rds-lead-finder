import PageHeader from '../components/PageHeader';

const GOOGLE_TERMS = 'https://cloud.google.com/maps-platform/terms';
const GOOGLE_PRIVACY = 'https://policies.google.com/privacy';

function Terms() {
  return (
    <>
      <PageHeader title="Terms of use">Terms for using this RDS Lead Finder deployment.</PageHeader>
      <div className="panel max-w-3xl space-y-6 p-5 text-sm leading-relaxed text-muted md:p-7">
        <section>
          <h2 className="font-semibold text-ink">Purpose and access</h2>
          <p className="mt-2">This tool is for authorized business lead research. Keep the administrator password confidential, follow applicable outreach and privacy laws, and do not use the service for scraping, bulk copying, harassment, or unlawful marketing.</p>
        </section>
        <section>
          <h2 className="font-semibold text-ink">Google Maps content</h2>
          <p className="mt-2">Business details are supplied by Google Maps and may be incomplete or inaccurate. Your use of that content is also governed by the <a className="text-accent underline" href={GOOGLE_TERMS} target="_blank" rel="noopener noreferrer">Google Maps Platform Terms of Service</a>. Do not export, store, or redistribute Google Maps content except where those terms expressly allow it.</p>
        </section>
        <section>
          <h2 className="font-semibold text-ink">Availability</h2>
          <p className="mt-2">The service is provided as available, without a guarantee of uninterrupted operation or lead accuracy. The deployment administrator may suspend access or remove saved data when needed.</p>
        </section>
      </div>
    </>
  );
}

function Privacy() {
  return (
    <>
      <PageHeader title="Privacy policy">How this RDS Lead Finder deployment handles data.</PageHeader>
      <div className="panel max-w-3xl space-y-6 p-5 text-sm leading-relaxed text-muted md:p-7">
        <section>
          <h2 className="font-semibold text-ink">Data the tool handles</h2>
          <p className="mt-2">The server stores saved Google Place IDs, your notes, and timestamps. A signed session cookie, theme, and recent search parameters are stored in your browser. The session cookie is HTTP-only and does not contain your password. Do not put personal, confidential, or sensitive information in notes or search fields.</p>
        </section>
        <section>
          <h2 className="font-semibold text-ink">Google Maps requests</h2>
          <p className="mt-2">Search terms and Place IDs are sent through the server to Google Maps Platform to retrieve business details. Google handles that information under the <a className="text-accent underline" href={GOOGLE_PRIVACY} target="_blank" rel="noopener noreferrer">Google Privacy Policy</a>. Business details are displayed live and are not persisted by this application.</p>
        </section>
        <section>
          <h2 className="font-semibold text-ink">Retention and control</h2>
          <p className="mt-2">Saved Place IDs and notes remain until an authorized user deletes them or the deployment administrator removes the database. You can remove saved leads in the app and clear browser storage through your browser settings. Contact the administrator of this deployment for access or deletion requests.</p>
        </section>
      </div>
    </>
  );
}

export default function Legal({ type }) {
  return type === 'privacy' ? <Privacy /> : <Terms />;
}
