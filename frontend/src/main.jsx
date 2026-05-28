import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, apiUrl, getToken, setToken } from "./api";
import "./styles.css";

const emptyDepartment = { name: "", code: "", contact_email: "" };
const emptyPerson = { full_name: "", person_type: "employee", email: "", phone: "", department_id: "", external_company: "" };
const emptyAsset = {
  asset_tag: "",
  name: "",
  category_id: "",
  status_id: "",
  location_id: "",
  serial_number: "",
  purchase_date: "",
  warranty_end: "",
  condition: "Good",
  notes: "",
};
const emptyUser = { username: "", full_name: "", password: "", role: "staff", department_id: "" };
const statusKinds = ["available", "assigned", "maintenance", "retired"];
const conditions = ["New", "Good", "Fair", "Damaged", "Lost"];

function App() {
  const [token, updateToken] = useState(getToken());
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [data, setData] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadAll() {
    if (!getToken()) return;
    setLoading(true);
    setError("");
    try {
      const me = await api("/auth/me");
      setUser(me);
      const requests = [
        ["dashboard", api("/dashboard")],
        ["departments", api("/departments")],
        ["people", api("/people")],
        ["categories", api("/masters/categories")],
        ["statuses", api("/masters/statuses")],
        ["locations", api("/masters/locations")],
        ["assets", api("/assets")],
        ["assignments", api("/assignments")],
        ["report", api("/reports/weekly")],
      ];
      if (me.role === "admin") requests.push(["users", api("/users")]);
      const results = await Promise.all(requests.map(([, promise]) => promise));
      const next = {};
      requests.forEach(([key], index) => {
        next[key] = results[index];
      });
      setData(next);
    } catch (err) {
      setError(err.message);
      if (String(err.message).includes("session") || String(err.message).includes("authenticated")) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [token]);

  function handleLogout() {
    setToken(null);
    updateToken(null);
    setUser(null);
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
        }),
      });
      setToken(result.token);
      updateToken(result.token);
      setUser(result.user);
      setMessage("Signed in.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function mutate(action, success = "Saved.") {
    try {
      await action();
      setMessage(success);
      setError("");
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!token || !user) {
    return <Login onSubmit={handleLogin} error={error} />;
  }

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} user={user} />
      <main className="main">
        <header className="topbar">
          <div>
            <span>Signed in as</span>
            <strong>{user.full_name}</strong>
          </div>
          <button className="button ghost" onClick={handleLogout}>Sign Out</button>
        </header>
        {message && <div className="flash success">{message}</div>}
        {error && <div className="flash error">{error}</div>}
        {loading && <div className="flash">Loading latest data...</div>}
        <Page page={page} data={data} user={user} mutate={mutate} setPage={setPage} />
      </main>
    </div>
  );
}

function Login({ onSubmit, error }) {
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand large">
          <span className="brand-mark">IS</span>
          <div>
            <strong>Inventory System</strong>
            <span>React + FastAPI</span>
          </div>
        </div>
        {error && <div className="flash error">{error}</div>}
        <form onSubmit={onSubmit}>
          <label><span>Username</span><input name="username" required /></label>
          <label><span>Password</span><input name="password" type="password" required /></label>
          <button className="button primary full">Sign In</button>
        </form>
      </section>
    </main>
  );
}

function Sidebar({ page, setPage, user }) {
  const nav = [
    ["dashboard", "Dashboard"],
    ["departments", "Departments"],
    ["people", "People"],
    ["assets", "Assets"],
    ["assignments", "Assignments"],
    ["reports", "Reports"],
  ];
  const masters = [
    ["categories", "Categories"],
    ["statuses", "Statuses"],
    ["locations", "Locations"],
  ];
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">IS</span>
        <div>
          <strong>Inventory System</strong>
          <span>Department assets</span>
        </div>
      </div>
      <nav>
        {nav.map(([key, label]) => <NavButton key={key} active={page === key} onClick={() => setPage(key)}>{label}</NavButton>)}
        <div className="nav-section">Master Tables</div>
        {masters.map(([key, label]) => <NavButton key={key} active={page === key} onClick={() => setPage(key)}>{label}</NavButton>)}
        {user.role === "admin" && <NavButton active={page === "users"} onClick={() => setPage("users")}>Users</NavButton>}
      </nav>
    </aside>
  );
}

function NavButton({ active, children, onClick }) {
  return <button className={`nav-link ${active ? "active" : ""}`} onClick={onClick}>{children}</button>;
}

function Page({ page, data, user, mutate, setPage }) {
  const props = { data, user, mutate, setPage };
  if (page === "dashboard") return <Dashboard {...props} />;
  if (page === "departments") return <Departments {...props} />;
  if (page === "people") return <People {...props} />;
  if (page === "assets") return <Assets {...props} />;
  if (page === "assignments") return <Assignments {...props} />;
  if (page === "reports") return <Reports {...props} />;
  if (page === "categories") return <MasterSimple {...props} title="Categories" rows={data.categories || []} endpoint="/masters/categories" placeholder="Printer, Tablet, Router" />;
  if (page === "statuses") return <Statuses {...props} />;
  if (page === "locations") return <MasterSimple {...props} title="Locations" rows={data.locations || []} endpoint="/masters/locations" placeholder="IT Closet, Store Room, Lab" />;
  if (page === "users") return <Users {...props} />;
  return null;
}

function Heading({ title, subtitle, action }) {
  return (
    <section className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div>{action}</div>
    </section>
  );
}

function Dashboard({ data, setPage }) {
  const stats = data.dashboard?.stats || {};
  const overdue = data.dashboard?.overdue || [];
  return (
    <>
      <Heading title="Dashboard" subtitle="Inventory status across departments." />
      <section className="stats-grid">
        <Stat label="Total Assets" value={stats.total_assets || 0} />
        <Stat label="Available" value={stats.available_assets || 0} />
        <Stat label="Checked Out" value={stats.active_assignments || 0} />
        <Stat label="Overdue" value={stats.overdue || 0} urgent />
        <Stat label="Due Soon" value={stats.due_soon || 0} />
      </section>
      <section className="panel">
        <div className="panel-header">
          <h2>Overdue Assets</h2>
          <button className="button small" onClick={() => setPage("reports")}>Open Report</button>
        </div>
        <DataTable
          columns={["Due", "Asset", "Assigned To", "Department"]}
          rows={overdue}
          render={(row) => [row.expected_return_on, `${row.asset_tag} - ${row.asset_name}`, row.person_name, row.department_name || "Unassigned"]}
        />
      </section>
    </>
  );
}

function Stat({ label, value, urgent }) {
  return <div className={`stat ${urgent ? "urgent" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function MasterSimple({ title, rows, endpoint, placeholder, user, mutate }) {
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const isAdmin = user.role === "admin";
  function startEdit(row) {
    setEditing(row);
    setName(row.name);
  }
  function reset() {
    setEditing(null);
    setName("");
  }
  async function submit(event) {
    event.preventDefault();
    const path = editing ? `${endpoint}/${editing.id}` : endpoint;
    const method = editing ? "PUT" : "POST";
    await mutate(() => api(path, { method, body: JSON.stringify({ name }) }), `${title.slice(0, -1)} saved.`);
    reset();
  }
  return (
    <>
      <Heading title={title} subtitle={`Manage ${title.toLowerCase()} used by asset records.`} />
      {isAdmin && (
        <section className="panel">
          <div className="panel-header"><h2>{editing ? `Edit ${title.slice(0, -1)}` : `Add ${title.slice(0, -1)}`}</h2></div>
          <form className="form-grid compact" onSubmit={submit}>
            <label><span>Name</span><input value={name} placeholder={placeholder} onChange={(event) => setName(event.target.value)} required /></label>
            <div className="form-actions">
              <button className="button primary">Save</button>
              <button className="button ghost" type="button" onClick={reset}>Clear</button>
            </div>
          </form>
        </section>
      )}
      <section className="panel">
        <DataTable
          columns={["Name", "Assets", "Status", "Actions"]}
          rows={rows}
          render={(row) => [
            row.name,
            row.asset_count || 0,
            <Badge tone={row.active ? "good" : "neutral"}>{row.active ? "Active" : "Inactive"}</Badge>,
            isAdmin && <RowActions row={row} onEdit={startEdit} endpoint={endpoint} mutate={mutate} />,
          ]}
        />
      </section>
    </>
  );
}

function Statuses({ data, user, mutate }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", kind: "available", sort_order: 100 });
  const isAdmin = user.role === "admin";
  function startEdit(row) {
    setEditing(row);
    setForm({ name: row.name, kind: row.kind, sort_order: row.sort_order || 100 });
  }
  function reset() {
    setEditing(null);
    setForm({ name: "", kind: "available", sort_order: 100 });
  }
  async function submit(event) {
    event.preventDefault();
    const path = editing ? `/masters/statuses/${editing.id}` : "/masters/statuses";
    const method = editing ? "PUT" : "POST";
    await mutate(() => api(path, { method, body: JSON.stringify({ ...form, sort_order: Number(form.sort_order || 100) }) }), "Status saved.");
    reset();
  }
  return (
    <>
      <Heading title="Statuses" subtitle="Configure status labels while keeping workflow behavior through status kind." />
      {isAdmin && (
        <section className="panel">
          <div className="panel-header"><h2>{editing ? "Edit Status" : "Add Status"}</h2></div>
          <form className="form-grid" onSubmit={submit}>
            <label><span>Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <label><span>Workflow Type</span><select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>{statusKinds.map((kind) => <option key={kind} value={kind}>{title(kind)}</option>)}</select></label>
            <label><span>Sort Order</span><input type="number" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value })} /></label>
            <div className="form-actions">
              <button className="button primary">Save</button>
              <button className="button ghost" type="button" onClick={reset}>Clear</button>
            </div>
          </form>
        </section>
      )}
      <section className="panel">
        <DataTable
          columns={["Name", "Workflow Type", "Assets", "Status", "Actions"]}
          rows={data.statuses || []}
          render={(row) => [
            row.name,
            title(row.kind),
            row.asset_count || 0,
            <Badge tone={row.active ? "good" : "neutral"}>{row.active ? "Active" : "Inactive"}</Badge>,
            isAdmin && <RowActions row={row} onEdit={startEdit} endpoint="/masters/statuses" mutate={mutate} />,
          ]}
        />
      </section>
    </>
  );
}

function Departments({ data, user, mutate }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyDepartment);
  const isAdmin = user.role === "admin";
  function startEdit(row) {
    setEditing(row);
    setForm({ name: row.name || "", code: row.code || "", contact_email: row.contact_email || "" });
  }
  function reset() {
    setEditing(null);
    setForm(emptyDepartment);
  }
  async function submit(event) {
    event.preventDefault();
    const path = editing ? `/departments/${editing.id}` : "/departments";
    const method = editing ? "PUT" : "POST";
    await mutate(() => api(path, { method, body: JSON.stringify(form) }), "Department saved.");
    reset();
  }
  return (
    <>
      <Heading title="Departments" subtitle="Maintain department ownership." />
      {isAdmin && <DepartmentForm form={form} setForm={setForm} onSubmit={submit} onClear={reset} editing={editing} />}
      <section className="panel">
        <DataTable columns={["Name", "Code", "Contact", "Status", "Actions"]} rows={data.departments || []} render={(row) => [
          row.name,
          row.code || "",
          row.contact_email || "",
          <Badge tone={row.active ? "good" : "neutral"}>{row.active ? "Active" : "Inactive"}</Badge>,
          isAdmin && <RowActions row={row} onEdit={startEdit} endpoint="/departments" mutate={mutate} />,
        ]} />
      </section>
    </>
  );
}

function DepartmentForm({ form, setForm, onSubmit, onClear, editing }) {
  return (
    <section className="panel">
      <div className="panel-header"><h2>{editing ? "Edit Department" : "Add Department"}</h2></div>
      <form className="form-grid" onSubmit={onSubmit}>
        <label><span>Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
        <label><span>Code</span><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label>
        <label><span>Contact Email</span><input type="email" value={form.contact_email} onChange={(event) => setForm({ ...form, contact_email: event.target.value })} /></label>
        <FormActions onClear={onClear} />
      </form>
    </section>
  );
}

function People({ data, user, mutate }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyPerson);
  const isAdmin = user.role === "admin";
  function startEdit(row) {
    setEditing(row);
    setForm({
      full_name: row.full_name || "",
      person_type: row.person_type || "employee",
      email: row.email || "",
      phone: row.phone || "",
      department_id: row.department_id || "",
      external_company: row.external_company || "",
    });
  }
  function reset() {
    setEditing(null);
    setForm(emptyPerson);
  }
  async function submit(event) {
    event.preventDefault();
    const payload = { ...form, department_id: numberOrNull(form.department_id) };
    const path = editing ? `/people/${editing.id}` : "/people";
    const method = editing ? "PUT" : "POST";
    await mutate(() => api(path, { method, body: JSON.stringify(payload) }), "Person saved.");
    reset();
  }
  return (
    <>
      <Heading title="People" subtitle="Employees and external consultants." />
      {isAdmin && (
        <section className="panel">
          <div className="panel-header"><h2>{editing ? "Edit Person" : "Add Person"}</h2></div>
          <form className="form-grid" onSubmit={submit}>
            <label><span>Full Name</span><input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required /></label>
            <label><span>Type</span><select value={form.person_type} onChange={(event) => setForm({ ...form, person_type: event.target.value })}><option value="employee">Employee</option><option value="consultant">Consultant</option></select></label>
            <label><span>Email</span><input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            <label><span>Phone</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
            <Select label="Department" value={form.department_id} onChange={(department_id) => setForm({ ...form, department_id })} rows={data.departments || []} />
            <label><span>External Company</span><input value={form.external_company} onChange={(event) => setForm({ ...form, external_company: event.target.value })} /></label>
            <FormActions onClear={reset} />
          </form>
        </section>
      )}
      <section className="panel">
        <DataTable columns={["Name", "Type", "Department", "Company", "Status", "Actions"]} rows={data.people || []} render={(row) => [
          row.full_name,
          title(row.person_type),
          row.department_name || "Unassigned",
          row.external_company || "",
          <Badge tone={row.active ? "good" : "neutral"}>{row.active ? "Active" : "Inactive"}</Badge>,
          isAdmin && <RowActions row={row} onEdit={startEdit} endpoint="/people" mutate={mutate} />,
        ]} />
      </section>
    </>
  );
}

function Assets({ data, user, mutate }) {
  const [editing, setEditing] = useState(null);
  const defaultStatus = useMemo(() => (data.statuses || []).find((row) => row.kind === "available" && row.active) || (data.statuses || [])[0], [data.statuses]);
  const [form, setForm] = useState(emptyAsset);
  const [uploadResult, setUploadResult] = useState(null);
  const isAdmin = user.role === "admin";
  useEffect(() => {
    if (!editing && defaultStatus && !form.status_id) {
      setForm((current) => ({ ...current, status_id: defaultStatus.id }));
    }
  }, [defaultStatus]);
  function startEdit(row) {
    setEditing(row);
    setForm({
      asset_tag: row.asset_tag || "",
      name: row.name || "",
      category_id: row.category_id || "",
      status_id: row.status_id || defaultStatus?.id || "",
      location_id: row.location_id || "",
      serial_number: row.serial_number || "",
      purchase_date: row.purchase_date || "",
      warranty_end: row.warranty_end || "",
      condition: row.condition || "Good",
      notes: row.notes || "",
    });
  }
  function reset() {
    setEditing(null);
    setForm({ ...emptyAsset, status_id: defaultStatus?.id || "" });
  }
  async function submit(event) {
    event.preventDefault();
    const payload = {
      ...form,
      category_id: numberOrNull(form.category_id),
      status_id: Number(form.status_id),
      location_id: numberOrNull(form.location_id),
    };
    const path = editing ? `/assets/${editing.id}` : "/assets";
    const method = editing ? "PUT" : "POST";
    await mutate(() => api(path, { method, body: JSON.stringify(payload) }), "Asset saved.");
    reset();
  }
  async function uploadCsv(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await mutate(async () => {
      const result = await api("/assets/bulk-upload", { method: "POST", body: JSON.stringify({ csv_text: text }) });
      setUploadResult(result);
    }, "Bulk upload completed.");
    event.target.value = "";
  }
  async function downloadTemplate() {
    await downloadWithAuth("/assets/template.csv", "asset-upload-template.csv");
  }
  return (
    <>
      <Heading title="Assets" subtitle="Asset register with configurable master data." action={isAdmin && <button className="button" onClick={downloadTemplate}>Download Upload Template</button>} />
      {isAdmin && (
        <section className="panel">
          <div className="panel-header"><h2>Bulk Upload</h2></div>
          <div className="upload-line">
            <input type="file" accept=".csv,text/csv" onChange={uploadCsv} />
            <span>CSV can create new categories and locations. Status must already exist in Master Tables.</span>
          </div>
          {uploadResult && <UploadResult result={uploadResult} />}
        </section>
      )}
      {isAdmin && (
        <section className="panel">
          <div className="panel-header"><h2>{editing ? "Edit Asset" : "Add Asset"}</h2></div>
          <form className="form-grid" onSubmit={submit}>
            <label><span>Asset Tag</span><input value={form.asset_tag} onChange={(event) => setForm({ ...form, asset_tag: event.target.value })} required /></label>
            <label><span>Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <Select label="Category" value={form.category_id} onChange={(category_id) => setForm({ ...form, category_id })} rows={(data.categories || []).filter((row) => row.active || row.id === form.category_id)} />
            <Select label="Status" value={form.status_id} onChange={(status_id) => setForm({ ...form, status_id })} rows={(data.statuses || []).filter((row) => row.active || row.id === form.status_id)} />
            <Select label="Location" value={form.location_id} onChange={(location_id) => setForm({ ...form, location_id })} rows={(data.locations || []).filter((row) => row.active || row.id === form.location_id)} />
            <label><span>Serial Number</span><input value={form.serial_number} onChange={(event) => setForm({ ...form, serial_number: event.target.value })} /></label>
            <label><span>Purchase Date</span><input type="date" value={form.purchase_date} onChange={(event) => setForm({ ...form, purchase_date: event.target.value })} /></label>
            <label><span>Warranty End</span><input type="date" value={form.warranty_end} onChange={(event) => setForm({ ...form, warranty_end: event.target.value })} /></label>
            <label><span>Condition</span><select value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value })}>{conditions.map((condition) => <option key={condition}>{condition}</option>)}</select></label>
            <label className="span-2"><span>Notes</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            <FormActions onClear={reset} />
          </form>
        </section>
      )}
      <section className="panel">
        <DataTable columns={["Asset", "Category", "Status", "Location", "Condition", "Assigned To", "Due", "Actions"]} rows={data.assets || []} render={(row) => [
          <strong>{row.asset_tag}<span>{row.name}</span></strong>,
          row.category_name || "",
          row.status_name || title(row.status),
          row.location_name || row.location || "",
          row.condition,
          row.assigned_to || "",
          row.expected_return_on || "",
          isAdmin && <button className="button small" onClick={() => startEdit(row)}>Edit</button>,
        ]} />
      </section>
    </>
  );
}

function UploadResult({ result }) {
  return (
    <div className="upload-result">
      <strong>Created: {result.created} Updated: {result.updated}</strong>
      {result.errors?.length > 0 && (
        <div>
          <p>{result.errors.length} row(s) need attention.</p>
          <ul>{result.errors.slice(0, 6).map((err) => <li key={`${err.row}-${err.error}`}>Row {err.row}: {err.error}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function Assignments({ data, user, mutate }) {
  const [form, setForm] = useState({ asset_id: "", person_id: "", assigned_on: today(), expected_return_on: "", notes: "" });
  const isAdmin = user.role === "admin";
  const assignableAssets = (data.assets || []).filter((asset) => asset.status_kind === "available");
  async function submit(event) {
    event.preventDefault();
    await mutate(() => api("/assignments", { method: "POST", body: JSON.stringify({ ...form, asset_id: Number(form.asset_id), person_id: Number(form.person_id) }) }), "Asset assigned.");
    setForm({ asset_id: "", person_id: "", assigned_on: today(), expected_return_on: "", notes: "" });
  }
  async function markReturn(row, condition) {
    await mutate(() => api(`/assignments/${row.id}/return`, { method: "POST", body: JSON.stringify({ returned_on: today(), return_condition: condition, notes: row.notes || "" }) }), "Return recorded.");
  }
  return (
    <>
      <Heading title="Assignments" subtitle="Check assets out and record returns." />
      {isAdmin && (
        <section className="panel">
          <div className="panel-header"><h2>Assign Asset</h2></div>
          <form className="form-grid" onSubmit={submit}>
            <Select label="Available Asset" value={form.asset_id} onChange={(asset_id) => setForm({ ...form, asset_id })} rows={assignableAssets} labelKey={(row) => `${row.asset_tag} - ${row.name}`} required />
            <Select label="Assign To" value={form.person_id} onChange={(person_id) => setForm({ ...form, person_id })} rows={(data.people || []).filter((row) => row.active)} labelKey={(row) => row.full_name} required />
            <label><span>Assigned On</span><input type="date" value={form.assigned_on} onChange={(event) => setForm({ ...form, assigned_on: event.target.value })} required /></label>
            <label><span>Expected Return</span><input type="date" value={form.expected_return_on} onChange={(event) => setForm({ ...form, expected_return_on: event.target.value })} /></label>
            <label className="span-2"><span>Notes</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            <div className="span-2"><button className="button primary">Assign Asset</button></div>
          </form>
        </section>
      )}
      <section className="panel">
        <div className="panel-header"><h2>Active Checkouts</h2></div>
        <DataTable columns={["Asset", "Person", "Department", "Assigned", "Due", "Status", "Return"]} rows={data.assignments?.active || []} render={(row) => [
          `${row.asset_tag} - ${row.asset_name}`,
          row.person_name,
          row.department_name || "Unassigned",
          row.assigned_on,
          row.expected_return_on || "",
          isOverdue(row.expected_return_on) ? <Badge tone="danger">Overdue</Badge> : <Badge tone="info">Active</Badge>,
          isAdmin && <select onChange={(event) => event.target.value && markReturn(row, event.target.value)} defaultValue=""><option value="">Return...</option>{conditions.map((condition) => <option key={condition}>{condition}</option>)}</select>,
        ]} />
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Recent Returns</h2></div>
        <DataTable columns={["Asset", "Person", "Department", "Assigned", "Returned", "Condition"]} rows={data.assignments?.history || []} render={(row) => [
          `${row.asset_tag} - ${row.asset_name}`,
          row.person_name,
          row.department_name || "Unassigned",
          row.assigned_on,
          row.returned_on || "",
          row.return_condition || "",
        ]} />
      </section>
    </>
  );
}

function Reports({ data }) {
  async function download() {
    await downloadWithAuth("/reports/weekly.csv", "weekly-report.csv");
  }
  const sections = data.report?.sections || {};
  return (
    <>
      <Heading title="Reports" subtitle="Weekly inventory report." action={<button className="button" onClick={download}>Download CSV</button>} />
      <ReportSection title="Overdue" rows={sections.overdue || []} />
      <ReportSection title="Due This Week" rows={sections.due_soon || []} />
      <ReportSection title="Assigned In Range" rows={sections.assigned_in_range || []} />
      <ReportSection title="Returned In Range" rows={sections.returned_in_range || []} />
    </>
  );
}

function ReportSection({ title, rows }) {
  return (
    <section className="panel">
      <div className="panel-header"><h2>{title}</h2></div>
      <DataTable columns={["Asset", "Person", "Department", "Assigned", "Due", "Returned"]} rows={rows} render={(row) => [
        `${row.asset_tag} - ${row.asset_name}`,
        row.person_name,
        row.department_name || "Unassigned",
        row.assigned_on,
        row.expected_return_on || "",
        row.returned_on || "",
      ]} />
    </section>
  );
}

function Users({ data, mutate }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyUser);
  function startEdit(row) {
    setEditing(row);
    setForm({ username: row.username, full_name: row.full_name, password: "", role: row.role, department_id: row.department_id || "" });
  }
  function reset() {
    setEditing(null);
    setForm(emptyUser);
  }
  async function submit(event) {
    event.preventDefault();
    const payload = { ...form, department_id: numberOrNull(form.department_id), password: form.password || null };
    const path = editing ? `/users/${editing.id}` : "/users";
    const method = editing ? "PUT" : "POST";
    await mutate(() => api(path, { method, body: JSON.stringify(payload) }), "User saved.");
    reset();
  }
  return (
    <>
      <Heading title="Users" subtitle="Admin-created login accounts." />
      <section className="panel">
        <div className="panel-header"><h2>{editing ? "Edit User" : "Add User"}</h2></div>
        <form className="form-grid" onSubmit={submit}>
          <label><span>Full Name</span><input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required /></label>
          <label><span>Username</span><input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required /></label>
          <label><span>{editing ? "New Password" : "Temporary Password"}</span><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required={!editing} /></label>
          <label><span>Role</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="admin">Admin</option><option value="staff">Staff</option></select></label>
          <Select label="Department" value={form.department_id} onChange={(department_id) => setForm({ ...form, department_id })} rows={data.departments || []} />
          <FormActions onClear={reset} />
        </form>
      </section>
      <section className="panel">
        <DataTable columns={["Name", "Username", "Role", "Department", "Status", "Actions"]} rows={data.users || []} render={(row) => [
          row.full_name,
          row.username,
          title(row.role),
          row.department_name || "Unassigned",
          <Badge tone={row.active ? "good" : "neutral"}>{row.active ? "Active" : "Inactive"}</Badge>,
          <RowActions row={row} onEdit={startEdit} endpoint="/users" mutate={mutate} />,
        ]} />
      </section>
    </>
  );
}

function DataTable({ columns, rows, render }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td className="empty" colSpan={columns.length}>No records.</td></tr>}
          {rows.map((row) => <tr key={row.id || `${row.asset_tag}-${row.name}`}>{render(row).map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({ row, onEdit, endpoint, mutate }) {
  return (
    <div className="row-actions">
      <button className="button small" onClick={() => onEdit(row)}>Edit</button>
      <button className="button small ghost" onClick={() => mutate(() => api(`${endpoint}/${row.id}/toggle`, { method: "PATCH" }), "Status updated.")}>
        {row.active ? "Deactivate" : "Activate"}
      </button>
    </div>
  );
}

function Select({ label, value, onChange, rows, labelKey = (row) => row.name, required = false }) {
  return (
    <label>
      <span>{label}</span>
      <select value={value || ""} onChange={(event) => onChange(event.target.value)} required={required}>
        <option value="">Select</option>
        {rows.map((row) => <option key={row.id} value={row.id}>{labelKey(row)}{row.active === 0 ? " (inactive)" : ""}</option>)}
      </select>
    </label>
  );
}

function FormActions({ onClear }) {
  return (
    <div className="form-actions">
      <button className="button primary">Save</button>
      <button className="button ghost" type="button" onClick={onClear}>Clear</button>
    </div>
  );
}

function Badge({ tone = "neutral", children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function title(value = "") {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function numberOrNull(value) {
  return value ? Number(value) : null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(value) {
  return value && value < today();
}

async function downloadWithAuth(path, filename) {
  const token = getToken();
  const response = await fetch(apiUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Download failed");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

createRoot(document.getElementById("root")).render(<App />);
