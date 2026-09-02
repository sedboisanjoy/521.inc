import { useState } from "react";
import { useStore } from "../store";
import { Card, Field, Button } from "../ui";
import { Icon } from "../icons";
import { subjectFromActivity } from "../flow";

// Company — post job openings and review the ones already live.
export function EmployerPostings() {
  const { jobs, postJob, applications, identityDID, session, log, toast, openFlow, autoFlow } = useStore();
  const myDID = identityDID || "did:key:employer";
  const mine = jobs.filter((j) => j.employerDID === myDID);

  const [title, setTitle] = useState("Skilled Welder");
  const [company, setCompany] = useState(session.orgName || "Company");
  const [skill, setSkill] = useState("Welding");
  const [location, setLocation] = useState("Riyadh, KSA");
  const [wage, setWage] = useState(35000);

  function post() {
    if (!title.trim()) return toast("error", "Enter a job title.");
    const j = postJob({ title, company, employerDID: myDID, skill, location, wage: Number(wage) });
    const entry = log({ kind: "post", actor: "Company", title: `Posting: “${j.title}”`, detail: `${j.company} · ${j.location}`, ok: true });
    toast("success", "Job posting published — workers can now apply.");
    if (autoFlow) openFlow(subjectFromActivity(entry));
  }

  const countFor = (jobId: string) => applications.filter((a) => a.jobId === jobId).length;

  return (
    <div className="panel-grid">
      <Card title="Post a Job" tag="New Position" hint="Publish a position. Workers will see it and apply with a skill certificate.">
        <Field label="Job Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="row">
          <Field label="Company">
            <input value={company} onChange={(e) => setCompany(e.target.value)} />
          </Field>
          <Field label="Required Skill">
            <input value={skill} onChange={(e) => setSkill(e.target.value)} />
          </Field>
        </div>
        <div className="row">
          <Field label="Location">
            <input value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          <Field label="Monthly Salary (BDT)">
            <input type="number" value={wage} onChange={(e) => setWage(Number(e.target.value))} />
          </Field>
        </div>
        <Button onClick={post}>Publish Posting</Button>
      </Card>

      <Card title="Your Postings" tag={`${mine.length} active`} hint="Your published positions and how many have applied.">
        {mine.length === 0 ? (
          <div className="empty">
            <div className="empty-ico"><Icon name="clipboard" size={28} /></div>
            No postings yet — publish your first position.
          </div>
        ) : (
          <div className="job-list">
            {mine.map((j) => (
              <article key={j.id} className="job">
                <div className="job-head">
                  <div>
                    <div className="job-title">{j.title}</div>
                    <div className="job-company">{j.location} · {j.wage.toLocaleString()} BDT</div>
                  </div>
                  <span className="badge unknown">{countFor(j.id)} applicants</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
