import { Link } from "react-router-dom";

import { TownshipConfigResponse } from "../api/types";

interface Props {
  config: TownshipConfigResponse;
}

const features = [
  "Submit new service requests with photos",
  "Pinpoint locations on the township map",
  "Receive status updates by email or SMS",
  "Track progress with a dedicated request ID"
];

export default function ResidentLanding({ config }: Props) {
  const headline = config.branding?.hero_headline ?? `Report an issue in ${config.township.name}`;
  const subtitle =
    config.branding?.hero_subtitle ?? "Your reports help us triage and resolve issues faster.";

  return (
    <div>
      <header style={{ padding: "64px 0", background: "linear-gradient(135deg, #004080, #0c6bd6)", color: "#fff" }}>
        <div className="container" style={{ display: "grid", gap: "24px" }}>
          <span className="badge">Township Resident Portal</span>
          <h1 style={{ fontSize: "3rem", margin: 0 }}>{headline}</h1>
          <p style={{ fontSize: "1.2rem", maxWidth: "720px", lineHeight: 1.6 }}>{subtitle}</p>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <Link to="/requests/new" className="primary-button">
              Start New Request
            </Link>
            <Link to="/track" className="secondary-button">
              Track Existing Request
            </Link>
          </div>
        </div>
      </header>

      <main className="container" style={{ padding: "48px 0" }}>
        <section className="card" style={{ marginBottom: "32px" }}>
          <h2>What you can do</h2>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "12px", marginTop: "16px" }}>
            {features.map((feature) => (
              <li key={feature} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#0c6bd6" }} />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card" style={{ display: "grid", gap: "16px" }}>
          <h2>Need help?</h2>
          <p>
            Township IT staff can update the deployment configuration in <code>config/township.yaml</code> to
            customise colours, categories, and service integrations before running the one-command setup.
          </p>
          <p>
            Residents with urgent issues should continue to call 911. For non-emergency concerns, submit a request
            any time and our staff will review it promptly.
          </p>
        </section>
      </main>
    </div>
  );
}
