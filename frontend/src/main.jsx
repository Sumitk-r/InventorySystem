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
  purchase_cost: "",
  condition: "Good",
  notes: "",
};
const emptyUser = { username: "", full_name: "", password: "", role: "staff", department_id: "", person_id: "" };
const statusKinds = ["available", "assigned", "maintenance", "retired"];
const conditions = ["New", "Good", "Fair", "Damaged", "Lost"];
const navIcons = {
  dashboard: "dash",
  departments: "dept",
  people: "people",
  assets: "asset",
  assignments: "assign",
  search: "search",
  reports: "report",
  categories: "cat",
  statuses: "status",
  locations: "loc",
  users: "user",
};

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

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 2600);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 5200);
    return () => window.clearTimeout(timer);
  }, [error]);

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
      setMessage("");
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
          <div className="topbar-title">
            <span>Inventory / {title(page)}</span>
            <strong>Inventory workspace</strong>
          </div>
          <div className="account-pill">
            <span className="account-avatar">{initials(user.full_name)}</span>
            <div>
              <strong>{user.full_name}</strong>
              <span>{title(user.role)}</span>
            </div>
            {loading && <span className="sync-pill">Syncing</span>}
            <button className="button ghost small" onClick={handleLogout}>Sign Out</button>
          </div>
        </header>
        <Page page={page} data={data} user={user} mutate={mutate} setPage={setPage} />
        {(message || error) && <Toast tone={error ? "error" : "success"} message={error || message} onClose={() => error ? setError("") : setMessage("")} />}
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
    ["search", "Search"],
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
        {nav.map(([key, label]) => <NavButton key={key} icon={navIcons[key]} active={page === key} onClick={() => setPage(key)}>{label}</NavButton>)}
        <div className="nav-section">Master Tables</div>
        {masters.map(([key, label]) => <NavButton key={key} icon={navIcons[key]} active={page === key} onClick={() => setPage(key)}>{label}</NavButton>)}
        {user.role === "admin" && <NavButton icon={navIcons.users} active={page === "users"} onClick={() => setPage("users")}>Users</NavButton>}
      </nav>
    </aside>
  );
}

function NavButton({ active, children, icon, onClick }) {
  return <button className={`nav-link ${active ? "active" : ""}`} onClick={onClick}><span className="nav-icon" data-icon={icon}></span>{children}</button>;
}

function Page({ page, data, user, mutate, setPage }) {
  const props = { data, user, mutate, setPage };
  if (page === "dashboard") return <Dashboard {...props} />;
  if (page === "departments") return <Departments {...props} />;
  if (page === "people") return <People {...props} />;
  if (page === "assets") return <Assets {...props} />;
  if (page === "assignments") return <Assignments {...props} />;
  if (page === "search") return <SearchPage />;
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
  const assets = data.assets || [];
  return (
    <>
      <Heading title="Dashboard" subtitle="Inventory status across departments." />
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">Asset command center</span>
          <h2>{stats.active_assignments || 0} checked out, {stats.available_assets || 0} ready to assign</h2>
        </div>
        <div className="hero-metrics">
          <button type="button" onClick={() => setPage("reports")}><strong>{stats.overdue || 0}</strong> overdue</button>
          <button type="button" onClick={() => setPage("reports")}><strong>{stats.due_soon || 0}</strong> due soon</button>
        </div>
      </section>
      <section className="stats-grid">
        <Stat label="Total Assets" value={stats.total_assets || 0} onClick={() => setPage("assets")} />
        <Stat label="Available" value={stats.available_assets || 0} onClick={() => setPage("assets")} />
        <Stat label="Checked Out" value={stats.active_assignments || 0} onClick={() => setPage("assignments")} />
        <Stat label="Overdue" value={stats.overdue || 0} urgent onClick={() => setPage("reports")} />
        <Stat label="Due Soon" value={stats.due_soon || 0} onClick={() => setPage("reports")} />
      </section>
      <DashboardCharts assets={assets} />
      <section className="panel">
        <div className="panel-header">
          <h2>Overdue Assets</h2>
          <button className="button small" onClick={() => setPage("reports")}>Open Report</button>
        </div>
        <DataTable
          columns={["Due", "Asset", "Assigned To", "Department"]}
          rows={overdue}
          render={(row) => [formatDate(row.expected_return_on), `${row.asset_tag} - ${row.asset_name}`, row.person_name, row.department_name || "Unassigned"]}
        />
      </section>
    </>
  );
}

function DashboardCharts({ assets }) {
  const statusCounts = countBy(assets, (row) => row.status_name || title(row.status || "Unknown"));
  const categoryCounts = countBy(assets, (row) => row.category_name || "Unassigned");
  const statusEntries = Object.entries(statusCounts);
  const categoryEntries = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    <section className="chart-grid">
      <div className="panel chart-panel">
        <div className="panel-header"><h2>Status Mix</h2></div>
        <div className="donut-wrap">
          <div className="donut" style={{ background: donutGradient(statusEntries) }}>
            <span>{assets.length}</span>
            <small>assets</small>
          </div>
          <div className="legend-list">
            {statusEntries.length === 0 && <EmptyState compact title="No asset status yet" />}
            {statusEntries.map(([label, value], index) => (
              <div className="legend-row" key={label}>
                <span className="legend-dot" style={{ background: statusChartColor(label, index) }}></span>
                <strong>{label}</strong>
                <em>{value}</em>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel chart-panel">
        <div className="panel-header"><h2>Top Categories</h2></div>
        <div className="bar-list">
          {categoryEntries.length === 0 && <EmptyState compact title="No categories yet" />}
          {categoryEntries.map(([label, value], index) => (
            <div className="bar-row" key={label}>
              <div>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
              <progress max={Math.max(...categoryEntries.map(([, count]) => count), 1)} value={value} style={{ "--bar-color": chartColor(index) }}></progress>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, urgent, onClick }) {
  return (
    <button className={`stat ${urgent ? "urgent" : ""}`} onClick={onClick} type="button">
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

function Toast({ tone, message, onClose }) {
  return (
    <div className={`toast ${tone}`}>
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss notification">x</button>
    </div>
  );
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
  const [filters, setFilters] = useState({ search: "", status: "", category: "", location: "" });
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const isAdmin = user.role === "admin";
  const filteredAssets = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return (data.assets || []).filter((asset) => {
      const text = [
        asset.asset_tag,
        asset.name,
        asset.serial_number,
        asset.category_name,
        asset.location_name,
        asset.status_name,
        asset.condition,
        asset.assigned_to,
      ].join(" ").toLowerCase();
      return (!search || text.includes(search))
        && (!filters.status || String(asset.status_id || "") === String(filters.status))
        && (!filters.category || String(asset.category_id || "") === String(filters.category))
        && (!filters.location || String(asset.location_id || "") === String(filters.location));
    });
  }, [data.assets, filters]);
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
      purchase_cost: row.purchase_cost ?? "",
      condition: row.condition || "Good",
      notes: row.notes || "",
    });
    setAssetModalOpen(true);
  }
  function reset() {
    setEditing(null);
    setForm({ ...emptyAsset, status_id: defaultStatus?.id || "" });
    setAssetModalOpen(false);
  }
  async function submit(event) {
    event.preventDefault();
    const payload = {
      ...form,
      category_id: numberOrNull(form.category_id),
      status_id: Number(form.status_id),
      location_id: numberOrNull(form.location_id),
      purchase_cost: numberOrNull(form.purchase_cost),
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
  function openCreate() {
    setEditing(null);
    setForm({ ...emptyAsset, status_id: defaultStatus?.id || "" });
    setAssetModalOpen(true);
  }
  return (
    <>
      <Heading
        title="Assets"
        subtitle="Asset register with configurable master data."
        action={isAdmin && (
          <div className="action-group">
            <button className="button" onClick={downloadTemplate}><span className="button-icon" data-icon="download"></span>Template</button>
            <button className="button primary" onClick={openCreate}><span className="button-icon" data-icon="plus"></span>Add Asset</button>
          </div>
        )}
      />
      {isAdmin && (
        <section className="panel">
          <div className="panel-header"><h2>Bulk Upload</h2></div>
          <div className="upload-line">
            <input type="file" accept=".csv,text/csv" onChange={uploadCsv} />
            <span>Category, status, and location must already exist in Master Tables. Use YYYY-MM-DD for CSV dates.</span>
          </div>
          {uploadResult && <UploadResult result={uploadResult} />}
        </section>
      )}
      {isAdmin && assetModalOpen && (
        <Modal title={editing ? "Edit Asset" : "Add Asset"} onClose={reset}>
          <form className="form-grid" onSubmit={submit}>
            <label><span>Asset Tag</span><input value={form.asset_tag} onChange={(event) => setForm({ ...form, asset_tag: event.target.value })} required /></label>
            <label><span>Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <Select label="Category" value={form.category_id} onChange={(category_id) => setForm({ ...form, category_id })} rows={(data.categories || []).filter((row) => row.active || row.id === form.category_id)} />
            <Select label="Status" value={form.status_id} onChange={(status_id) => setForm({ ...form, status_id })} rows={(data.statuses || []).filter((row) => row.active || row.id === form.status_id)} />
            <Select label="Location" value={form.location_id} onChange={(location_id) => setForm({ ...form, location_id })} rows={(data.locations || []).filter((row) => row.active || row.id === form.location_id)} />
            <label><span>Serial Number</span><input value={form.serial_number} onChange={(event) => setForm({ ...form, serial_number: event.target.value })} /></label>
            <DateInput label="Purchase Date" value={form.purchase_date} onChange={(purchase_date) => setForm({ ...form, purchase_date })} />
            <DateInput label="Warranty End" value={form.warranty_end} onChange={(warranty_end) => setForm({ ...form, warranty_end })} />
            <label><span>Asset Value</span><input type="number" min="0" step="0.01" value={form.purchase_cost} onChange={(event) => setForm({ ...form, purchase_cost: event.target.value })} /></label>
            <label><span>Condition</span><select value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value })}>{conditions.map((condition) => <option key={condition}>{condition}</option>)}</select></label>
            <label className="span-2"><span>Notes</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            <FormActions onClear={reset} />
          </form>
        </Modal>
      )}
      <section className="panel">
        <AssetFilters filters={filters} setFilters={setFilters} data={data} />
        <DataTable columns={["Asset", "Category", "Status", "Location", "Condition", "Assigned To", "Due", "Actions"]} rows={filteredAssets} emptyTitle="No assets match this view" render={(row) => [
          <strong>{row.asset_tag}<span>{row.name}</span></strong>,
          row.category_name || "",
          <StatusChip value={row.status_name || title(row.status)} kind={row.status_kind || row.status} />,
          row.location_name || row.location || "",
          row.condition,
          row.assigned_to || "",
          formatDate(row.expected_return_on),
          isAdmin && <button className="icon-button" title="Edit asset" aria-label="Edit asset" onClick={() => startEdit(row)}><span className="button-icon" data-icon="edit"></span></button>,
        ]} />
      </section>
    </>
  );
}

function AssetFilters({ filters, setFilters, data }) {
  function update(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  return (
    <div className="filter-bar">
      <label className="search-field">
        <span>Search</span>
        <input value={filters.search} placeholder="Tag, name, serial, person" onChange={(event) => update("search", event.target.value)} />
      </label>
      <Select label="Status" value={filters.status} onChange={(value) => update("status", value)} rows={data.statuses || []} />
      <Select label="Category" value={filters.category} onChange={(value) => update("category", value)} rows={data.categories || []} />
      <Select label="Location" value={filters.location} onChange={(value) => update("location", value)} rows={data.locations || []} />
      <button className="button ghost" type="button" onClick={() => setFilters({ search: "", status: "", category: "", location: "" })}>Clear</button>
    </div>
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
  const [filters, setFilters] = useState({ category_id: "", department_id: "" });
  const isAdmin = user.role === "admin";
  const assignableAssets = useMemo(() => {
    return (data.assets || []).filter((asset) => {
      return asset.status_kind === "available"
        && (!filters.category_id || String(asset.category_id || "") === String(filters.category_id));
    });
  }, [data.assets, filters.category_id]);
  const assignablePeople = useMemo(() => {
    return (data.people || []).filter((person) => {
      return person.active
        && (!filters.department_id || String(person.department_id || "") === String(filters.department_id));
    });
  }, [data.people, filters.department_id]);
  async function submit(event) {
    event.preventDefault();
    await mutate(() => api("/assignments", { method: "POST", body: JSON.stringify({ ...form, asset_id: Number(form.asset_id), person_id: Number(form.person_id) }) }), "Asset assigned.");
    setForm({ asset_id: "", person_id: "", assigned_on: today(), expected_return_on: "", notes: "" });
    setFilters({ category_id: "", department_id: "" });
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
            <Select label="Filter by Category" value={filters.category_id} onChange={(category_id) => { setFilters({ ...filters, category_id }); setForm({ ...form, asset_id: "" }); }} rows={(data.categories || []).filter((row) => row.active)} />
            <Select label="Filter by Department" value={filters.department_id} onChange={(department_id) => { setFilters({ ...filters, department_id }); setForm({ ...form, person_id: "" }); }} rows={(data.departments || []).filter((row) => row.active)} />
            <SearchableSelect
              label={`Available Asset (${assignableAssets.length})`}
              value={form.asset_id}
              onChange={(asset_id) => setForm({ ...form, asset_id })}
              rows={assignableAssets}
              labelKey={(row) => `${row.asset_tag} - ${row.name}${row.category_name ? ` (${row.category_name})` : ""}`}
              placeholder="Search asset tag or name"
              required
            />
            <SearchableSelect
              label={`Assign To (${assignablePeople.length})`}
              value={form.person_id}
              onChange={(person_id) => setForm({ ...form, person_id })}
              rows={assignablePeople}
              labelKey={(row) => `${row.full_name}${row.department_name ? ` (${row.department_name})` : ""}`}
              placeholder="Search employee name"
              required
            />
            <DateInput label="Assigned On" value={form.assigned_on} onChange={(assigned_on) => setForm({ ...form, assigned_on })} required />
            <DateInput label="Expected Return" value={form.expected_return_on} onChange={(expected_return_on) => setForm({ ...form, expected_return_on })} />
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
          formatDate(row.assigned_on),
          formatDate(row.expected_return_on),
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
          formatDate(row.assigned_on),
          formatDate(row.returned_on),
          row.return_condition || "",
        ]} />
      </section>
    </>
  );
}

function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    const clean = query.trim();
    if (clean.length < 2) return;
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const rows = await api(`/search?q=${encodeURIComponent(clean)}`);
      setResults(rows);
    } catch (err) {
      setResults([]);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Heading title="Search" subtitle="Find assets by tag, name, category, location, person, status, condition, or notes." />
      <section className="panel">
        <form className="search-panel" onSubmit={submit}>
          <label>
            <span>Global Search</span>
            <input value={query} placeholder="Example: damaged laptop in IT closet" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button className="button primary" disabled={loading}>{loading ? "Searching" : "Search"}</button>
        </form>
        {error && <div className="flash error">{error}</div>}
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Search Results</h2></div>
        <DataTable
          columns={["Asset", "Category", "Status", "Location", "Assigned To", "Condition", "Notes"]}
          rows={results}
          emptyTitle={searched ? "No matching assets found" : "Search across inventory records"}
          render={(row) => [
            <strong>{row.asset_tag}<span>{row.name}</span></strong>,
            row.category_name || "",
            <StatusChip value={row.status_name || title(row.status_kind)} kind={row.status_kind} />,
            row.location_name || "",
            row.assigned_to || "",
            row.condition || "",
            row.notes || "",
          ]}
        />
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
      <InventoryCategoryReport rows={sections.inventory_by_category || []} />
      <ValueSummaryReport rows={sections.inventory_value_summary || []} />
      <NonWorkingAssetReport rows={sections.non_working_assets || []} />
      <ReportSection title="Overdue" rows={sections.overdue || []} />
      <ReportSection title="Due This Week" rows={sections.due_soon || []} />
      <ReportSection title="Assigned In Range" rows={sections.assigned_in_range || []} />
      <ReportSection title="Returned In Range" rows={sections.returned_in_range || []} />
      <AssetReportSection title="Available Asset Report" rows={sections.available_assets || []} />
      <ReportSection title="Assigned Assets Report" rows={sections.assigned_assets || []} />
      <AssetReportSection title="Assets Under Maintenance" rows={sections.maintenance_assets || []} />
      <ReportSection title="Returned Assets Report" rows={sections.returned_assets || []} />
    </>
  );
}

function InventoryCategoryReport({ rows }) {
  return (
    <section className="panel">
      <div className="panel-header"><h2>Current Inventory By Category</h2></div>
      <DataTable columns={["Category", "Total", "Available", "Assigned", "Maintenance", "Retired", "Value"]} rows={rows} render={(row) => [
        row.category_name || "Unassigned",
        row.total_assets || 0,
        row.available_assets || 0,
        row.assigned_assets || 0,
        row.maintenance_assets || 0,
        row.retired_assets || 0,
        formatMoney(row.total_value),
      ]} />
    </section>
  );
}

function ValueSummaryReport({ rows }) {
  return (
    <section className="panel">
      <div className="panel-header"><h2>Inventory Value Summary</h2></div>
      <DataTable columns={["Metric", "Assets", "Amount"]} rows={rows} render={(row) => [
        row.metric,
        row.asset_count || 0,
        formatMoney(row.amount),
      ]} />
    </section>
  );
}

function NonWorkingAssetReport({ rows }) {
  return (
    <section className="panel">
      <div className="panel-header"><h2>Non-working Assets</h2></div>
      <DataTable columns={["Asset", "Category", "Status", "Condition", "Reason"]} rows={rows} render={(row) => [
        `${row.asset_tag} - ${row.name}`,
        row.category_name || "",
        <StatusChip value={row.status_name || title(row.status)} kind={row.status_kind || row.status} />,
        row.condition || "",
        row.reason || row.notes || "Not specified",
      ]} />
    </section>
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
        formatDate(row.assigned_on),
        formatDate(row.expected_return_on),
        formatDate(row.returned_on),
      ]} />
    </section>
  );
}

function AssetReportSection({ title: sectionTitle, rows }) {
  return (
    <section className="panel">
      <div className="panel-header"><h2>{sectionTitle}</h2></div>
      <DataTable columns={["Asset", "Category", "Status", "Location", "Condition"]} rows={rows} render={(row) => [
        `${row.asset_tag} - ${row.name}`,
        row.category_name || "",
        row.status_name || title(row.status),
        row.location_name || row.location || "",
        row.condition || "",
      ]} />
    </section>
  );
}

function Users({ data, mutate }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyUser);
  function startEdit(row) {
    setEditing(row);
    setForm({
      username: row.username,
      full_name: row.full_name,
      password: "",
      role: row.role,
      department_id: row.department_id || "",
      person_id: row.person_id || "",
    });
  }
  function reset() {
    setEditing(null);
    setForm(emptyUser);
  }
  async function submit(event) {
    event.preventDefault();
    const payload = {
      ...form,
      department_id: numberOrNull(form.department_id),
      person_id: numberOrNull(form.person_id),
      password: form.password || null,
    };
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
          <Select label="Linked Person" value={form.person_id} onChange={(person_id) => setForm({ ...form, person_id })} rows={(data.people || []).filter((row) => row.active || row.id === form.person_id)} labelKey={(row) => row.full_name} />
          <FormActions onClear={reset} />
        </form>
      </section>
      <section className="panel">
        <DataTable columns={["Name", "Username", "Role", "Department", "Person", "Status", "Actions"]} rows={data.users || []} render={(row) => [
          row.full_name,
          row.username,
          title(row.role),
          row.department_name || "Unassigned",
          row.person_name || "Not linked",
          <Badge tone={row.active ? "good" : "neutral"}>{row.active ? "Active" : "Inactive"}</Badge>,
          <RowActions row={row} onEdit={startEdit} endpoint="/users" mutate={mutate} />,
        ]} />
      </section>
    </>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <section className="modal-panel">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close"><span className="button-icon" data-icon="close"></span></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function DataTable({ columns, rows, render, emptyTitle = "No records yet" }) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} />;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id || `${row.asset_tag}-${row.name}`}>
              {render(row).map((cell, index) => <td data-label={columns[index]} key={index}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({ row, onEdit, endpoint, mutate }) {
  return (
    <div className="row-actions">
      <button className="icon-button" title="Edit" aria-label="Edit" onClick={() => onEdit(row)}><span className="button-icon" data-icon="edit"></span></button>
      <button className="icon-button" title={row.active ? "Deactivate" : "Activate"} aria-label={row.active ? "Deactivate" : "Activate"} onClick={() => mutate(() => api(`${endpoint}/${row.id}/toggle`, { method: "PATCH" }), "Status updated.")}>
        <span className="button-icon" data-icon={row.active ? "pause" : "play"}></span>
      </button>
    </div>
  );
}

function EmptyState({ title = "No records yet", compact = false }) {
  return (
    <div className={`empty-state ${compact ? "compact" : ""}`}>
      <span className="empty-icon"></span>
      <strong>{title}</strong>
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

function SearchableSelect({ label, value, onChange, rows, labelKey = (row) => row.name, placeholder = "Search", required = false }) {
  const [query, setQuery] = useState("");
  const clean = query.trim().toLowerCase();
  const selected = rows.find((row) => String(row.id) === String(value));
  const filtered = rows.filter((row) => !clean || labelKey(row).toLowerCase().includes(clean));
  const visibleRows = selected && !filtered.some((row) => row.id === selected.id) ? [selected, ...filtered] : filtered;
  return (
    <label className="searchable-select">
      <span>{label}</span>
      <input value={query} placeholder={placeholder} onChange={(event) => setQuery(event.target.value)} />
      <select value={value || ""} onChange={(event) => onChange(event.target.value)} required={required}>
        <option value="">{visibleRows.length ? "Select" : "No matching records"}</option>
        {visibleRows.map((row) => <option key={row.id} value={row.id}>{labelKey(row)}</option>)}
      </select>
    </label>
  );
}

function DateInput({ label, value, onChange, required = false }) {
  const [text, setText] = useState(formatDate(value));
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(monthFromValue(value));

  useEffect(() => {
    setText(formatDate(value));
    setVisibleMonth(monthFromValue(value));
  }, [value]);

  function commit(nextText) {
    const parsed = parseDisplayDate(nextText);
    if (parsed || !nextText.trim()) {
      onChange(parsed);
      if (parsed) setVisibleMonth(monthFromValue(parsed));
    }
  }

  function pickDate(nextValue) {
    onChange(nextValue);
    setText(formatDate(nextValue));
    setVisibleMonth(monthFromValue(nextValue));
    setOpen(false);
  }

  return (
    <label className="date-field">
      <span>{label}</span>
      <div className="date-control">
        <input
          value={text}
          placeholder="DD/MM/YYYY"
          required={required}
          pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
          inputMode="numeric"
          title="Use DD/MM/YYYY"
          onBlur={(event) => commit(event.target.value)}
          onChange={(event) => setText(event.target.value)}
        />
        <button className="date-button" type="button" onClick={() => setOpen((current) => !current)} aria-label={`Pick ${label}`} title={`Pick ${label}`}>
          <span className="calendar-icon" aria-hidden="true"></span>
        </button>
      </div>
      {open && <CalendarPicker value={value} visibleMonth={visibleMonth} setVisibleMonth={setVisibleMonth} onPick={pickDate} />}
    </label>
  );
}

function CalendarPicker({ value, visibleMonth, setVisibleMonth, onPick }) {
  const days = calendarDays(visibleMonth);
  const monthLabel = visibleMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  return (
    <div className="calendar-popover">
      <div className="calendar-header">
        <button type="button" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}>Prev</button>
        <strong>{monthLabel}</strong>
        <button type="button" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}>Next</button>
      </div>
      <div className="calendar-grid calendar-weekdays">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="calendar-grid">
        {days.map((day) => (
          <button
            className={`${day.inMonth ? "" : "muted"} ${day.value === value ? "selected" : ""}`}
            key={day.value}
            type="button"
            onClick={() => onPick(day.value)}
          >
            {day.label}
          </button>
        ))}
      </div>
    </div>
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

function StatusChip({ value, kind }) {
  return <Badge tone={statusTone(kind || value)}>{value || "Unknown"}</Badge>;
}

function title(value = "") {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function countBy(rows, getKey) {
  return rows.reduce((counts, row) => {
    const key = getKey(row) || "Unassigned";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function chartColor(index) {
  return ["#1f7a61", "#315f7d", "#f0b35b", "#b86b4b", "#6f7d78", "#8f6ab7"][index % 6];
}

function statusChartColor(label, index = 0) {
  const clean = String(label || "").toLowerCase();
  if (clean.includes("available")) return "#1f8a5b";
  if (clean.includes("assigned") || clean.includes("checked")) return "#2563eb";
  if (clean.includes("maintenance")) return "#d28716";
  if (clean.includes("retired") || clean.includes("lost")) return "#7b8794";
  return chartColor(index);
}

function donutGradient(entries) {
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (!total) return "conic-gradient(#dce3df 0 360deg)";
  let cursor = 0;
  const stops = entries.map(([label, value], index) => {
    const start = cursor;
    cursor += (value / total) * 360;
    return `${statusChartColor(label, index)} ${start}deg ${cursor}deg`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function statusTone(value = "") {
  const clean = String(value).toLowerCase();
  if (clean.includes("available") || clean.includes("active")) return "good";
  if (clean.includes("assigned") || clean.includes("checked")) return "info";
  if (clean.includes("maintenance") || clean.includes("damaged") || clean.includes("due")) return "warning";
  if (clean.includes("retired") || clean.includes("lost") || clean.includes("overdue")) return "danger";
  return "neutral";
}

function initials(value = "") {
  return String(value)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "IS";
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  });
}

function parseDisplayDate(value) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  const match = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function monthFromValue(value) {
  const clean = value || today();
  const [year, month] = clean.split("-").map(Number);
  return new Date(year || new Date().getFullYear(), (month || new Date().getMonth() + 1) - 1, 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function calendarDays(monthDate) {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const mondayOffset = (start.getDay() + 6) % 7;
  const first = new Date(start);
  first.setDate(start.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    return {
      inMonth: day.getMonth() === monthDate.getMonth(),
      label: day.getDate(),
      value: isoDate(day),
    };
  });
}

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
