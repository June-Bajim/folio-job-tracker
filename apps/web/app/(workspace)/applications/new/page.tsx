import { ApplicationForm } from "../../../../components/application-form";
export default function Page() {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A NEW POSSIBILITY</span>
          <h1>
            Add an application<span className="green">.</span>
          </h1>
          <p>Give your next opportunity a home.</p>
        </div>
      </div>
      <section className="panel form-panel">
        <ApplicationForm />
      </section>
    </>
  );
}
