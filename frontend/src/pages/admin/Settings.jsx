import { useToast } from '../../context/ToastContext';

export default function Settings() {
  const showToast = useToast();

  return (
    <div className="panel">
      <div className="section-title">System settings</div>
      <p className="sub">Frontend configuration preview for the Montenegro management system.</p>
      <div className="form">
        <label className="field">
          Company name
          <input defaultValue="Montenegro Lines" />
        </label>
        <label className="field">
          Currency
          <select>
            <option>PHP — Philippine Peso</option>
          </select>
        </label>
        <label className="field">
          Default booking status
          <select>
            <option>Pending</option>
          </select>
        </label>
        <label className="field">
          Timezone
          <select>
            <option>Asia/Manila (UTC+8)</option>
          </select>
        </label>
        <button
          className="btn primary fullcol"
          onClick={() => showToast('Settings saved successfully')}
        >
          Save settings
        </button>
      </div>
    </div>
  );
}
