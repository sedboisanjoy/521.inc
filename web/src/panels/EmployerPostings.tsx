import { useState } from "react";
import { useStore } from "../store";
import { Card, Field, Button } from "../ui";

// Company — post job openings and review the ones already live.
export function EmployerPostings() {
  const { jobs, postJob, applications, identityDID, log, toast } = useStore();
  const myDID = identityDID || "did:key:employer";
  const mine = jobs.filter((j) => j.employerDID === myDID);

  const [title, setTitle] = useState("Certified Welder");
  const [company, setCompany] = useState("SaudiCo Ltd");
  const [skill, setSkill] = useState("Welding");
  const [location, setLocation] = useState("Riyadh, KSA");
  const [wage, setWage] = useState(35000);

  function post() {
    if (!title.trim()) return toast("error", "Job title is required.");
    const j = postJob({ title, company, employerDID: myDID, skill, location, wage: Number(wage) });
    log({ kind: "post", actor: "Company", title: `Posted “${j.title}”`, detail: `${j.company} · ${j.location}`, ok: true });
    toast("success", "Job posted — workers can now apply.");
  }

  const countFor = (jobId: string) => applications.filter((a) => a.jobId === jobId).length;

  return (
    <div className="panel-grid">
      <Card title="Post a Job" tag="opening" hint="Publish a role. Workers browse and apply with a skill certificate.">
        <Field label="Job title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="row">
          <Field label="Company">
            <input value={company} onChange={(e) => setCompany(e.target.value)} />
          </Field>
          <Field label="Required skill">
            <input value={skill} onChange={(e) => setSkill(e.target.value)} />
          </Field>
        </div>
        <div className="row">
          <Field label="Location">
            <input value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          <Field label="Monthly wage (BDT)">
            <input type="number" value={wage} onChange={(e) => setWage(Number(e.target.value))} />
          </Field>
        </div>
        <Button onClick={post}>Publish job</Button>
      </Card>

      <Card title="Your Postings" tag={`${mine.length} live`} hint="Openings you've published and how many have applied.">
        {mine.length === 0 ? (
          <div className="empty">
            <div className="empty-ico">📋</div>
            No postings yet — publish your first opening.
          </div>
        ) : (
          <div className="job-list">
            {mine.map((j) => (
              <article key={j.id} className="job">
                <div className="job-head">
                  <div>
                    <div className="job-title">{j.title}</div>
                    <div className="job-company">📍 {j.location} · {j.wage.toLocaleString()} BDT</div>
                  </div>
                  <span className="badge unknown">{countFor(j.id)} applicant{countFor(j.id) === 1 ? "" : "s"}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
