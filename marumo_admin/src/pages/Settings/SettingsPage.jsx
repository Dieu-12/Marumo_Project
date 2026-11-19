import { useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { INITIAL_SETTINGS } from '../../data/mockData.js';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';
import { validateSettingsForm } from '../../utils/validators.js';
import { Button } from '../../components/common/Button.jsx';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import './SettingsPage.css';

export function SettingsPage() {
  const { settings, saveSettings, pushToast } = useAdminStore();
  const [formValues, setFormValues] = useState({
    ...settings,
    taxRate: String(settings.taxRate),
    convenienceFee: String(settings.convenienceFee),
    seatHoldMinutes: String(settings.seatHoldMinutes),
    maxTicketsPerOrder: String(settings.maxTicketsPerOrder),
    lowOccupancyThreshold: String(settings.lowOccupancyThreshold),
  });
  const [errors, setErrors] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();
    const candidate = {
      ...formValues,
      taxRate: Number(formValues.taxRate),
      convenienceFee: Number(formValues.convenienceFee),
      seatHoldMinutes: Number(formValues.seatHoldMinutes),
      maxTicketsPerOrder: Number(formValues.maxTicketsPerOrder),
      lowOccupancyThreshold: Number(formValues.lowOccupancyThreshold),
    };
    const result = validateSettingsForm(candidate);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    saveSettings(candidate);
  };

  const handleReset = () => {
    setFormValues({
      ...INITIAL_SETTINGS,
      taxRate: String(INITIAL_SETTINGS.taxRate),
      convenienceFee: String(INITIAL_SETTINGS.convenienceFee),
      seatHoldMinutes: String(INITIAL_SETTINGS.seatHoldMinutes),
      maxTicketsPerOrder: String(INITIAL_SETTINGS.maxTicketsPerOrder),
      lowOccupancyThreshold: String(INITIAL_SETTINGS.lowOccupancyThreshold),
    });
    setErrors({});
    saveSettings(INITIAL_SETTINGS);
    pushToast('Restored default system settings');
  };

  return (
    <div>
      <PageHeader
        title="System Settings"
        subtitle="Configure platform defaults, ticketing fees, seat hold timers, and operational alerts."
      />

      <form className="settings-layout" onSubmit={handleSubmit} noValidate>
        <div className="settings-card">
          <div className="form-section">
            <div className="form-section-title">General Platform Configuration</div>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="set-platform" className="form-label">
                  Platform Name <span className="form-required">*</span>
                </label>
                <input
                  id="set-platform"
                  className={`form-input ${errors.platformName ? 'form-input--error' : ''}`.trim()}
                  value={formValues.platformName}
                  onChange={(e) => setFormValues({ ...formValues, platformName: e.target.value })}
                />
                {errors.platformName ? (
                  <span className="form-error">{errors.platformName}</span>
                ) : null}
              </div>

              <div className="form-field">
                <label htmlFor="set-email" className="form-label">
                  Operations Support Email <span className="form-required">*</span>
                </label>
                <input
                  id="set-email"
                  type="email"
                  className={`form-input ${errors.supportEmail ? 'form-input--error' : ''}`.trim()}
                  value={formValues.supportEmail}
                  onChange={(e) => setFormValues({ ...formValues, supportEmail: e.target.value })}
                />
                {errors.supportEmail ? (
                  <span className="form-error">{errors.supportEmail}</span>
                ) : null}
              </div>

              <div className="form-field">
                <label htmlFor="set-currency" className="form-label">
                  Settlement Currency
                </label>
                <select
                  id="set-currency"
                  className="form-select"
                  value={formValues.currency}
                  onChange={(e) => setFormValues({ ...formValues, currency: e.target.value })}
                >
                  <option value="USD">USD ($)</option>
                  <option value="JPY">JPY (¥)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="set-tz" className="form-label">
                  Default Timezone
                </label>
                <select
                  id="set-tz"
                  className="form-select"
                  value={formValues.timezone}
                  onChange={(e) => setFormValues({ ...formValues, timezone: e.target.value })}
                >
                  <option value="Asia/Tokyo (UTC+09:00)">Asia/Tokyo (UTC+09:00)</option>
                  <option value="Asia/Singapore (UTC+08:00)">Asia/Singapore (UTC+08:00)</option>
                  <option value="America/Los_Angeles (UTC-08:00)">America/Los_Angeles (UTC-08:00)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Ticketing Rules &amp; Fee Structure</div>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="set-tax" className="form-label">
                  Sales Tax Rate (%) <span className="form-required">*</span>
                </label>
                <input
                  id="set-tax"
                  type="number"
                  step="0.5"
                  className={`form-input ${errors.taxRate ? 'form-input--error' : ''}`.trim()}
                  value={formValues.taxRate}
                  onChange={(e) => setFormValues({ ...formValues, taxRate: e.target.value })}
                />
                {errors.taxRate ? <span className="form-error">{errors.taxRate}</span> : null}
              </div>

              <div className="form-field">
                <label htmlFor="set-fee" className="form-label">
                  Online Convenience Fee ($) <span className="form-required">*</span>
                </label>
                <input
                  id="set-fee"
                  type="number"
                  step="0.25"
                  className={`form-input ${errors.convenienceFee ? 'form-input--error' : ''}`.trim()}
                  value={formValues.convenienceFee}
                  onChange={(e) => setFormValues({ ...formValues, convenienceFee: e.target.value })}
                />
                {errors.convenienceFee ? (
                  <span className="form-error">{errors.convenienceFee}</span>
                ) : null}
              </div>

              <div className="form-field">
                <label htmlFor="set-hold" className="form-label">
                  Seat Checkout Hold (minutes) <span className="form-required">*</span>
                </label>
                <input
                  id="set-hold"
                  type="number"
                  className={`form-input ${errors.seatHoldMinutes ? 'form-input--error' : ''}`.trim()}
                  value={formValues.seatHoldMinutes}
                  onChange={(e) => setFormValues({ ...formValues, seatHoldMinutes: e.target.value })}
                />
                {errors.seatHoldMinutes ? (
                  <span className="form-error">{errors.seatHoldMinutes}</span>
                ) : null}
              </div>

              <div className="form-field">
                <label htmlFor="set-max" className="form-label">
                  Max Tickets Per Order
                </label>
                <input
                  id="set-max"
                  type="number"
                  min="1"
                  max="20"
                  className="form-input"
                  value={formValues.maxTicketsPerOrder}
                  onChange={(e) =>
                    setFormValues({ ...formValues, maxTicketsPerOrder: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          <div className="settings-actions-bar">
            <Button variant="secondary" onClick={handleReset}>
              <RotateCcw size={15} aria-hidden="true" />
              <span>Reset Defaults</span>
            </Button>
            <Button variant="primary" type="submit">
              <Save size={15} aria-hidden="true" />
              <span>Save Settings</span>
            </Button>
          </div>
        </div>

        <div className="settings-card">
          <div className="form-section-title">Checkout &amp; Alert Preferences</div>
          <div className="settings-toggle-list">
            <label className="settings-toggle-row">
              <div>
                <div className="settings-toggle-title">Allow Guest Checkout</div>
                <div className="settings-toggle-desc">
                  Permit ticket purchases without creating a MARUMO Rewards account.
                </div>
              </div>
              <input
                type="checkbox"
                className="switch-input"
                checked={formValues.allowGuestCheckout}
                onChange={(e) =>
                  setFormValues({ ...formValues, allowGuestCheckout: e.target.checked })
                }
              />
            </label>

            <label className="settings-toggle-row">
              <div>
                <div className="settings-toggle-title">Auto-Cancel Unpaid Orders</div>
                <div className="settings-toggle-desc">
                  Release held seats automatically once the checkout timer expires.
                </div>
              </div>
              <input
                type="checkbox"
                className="switch-input"
                checked={formValues.autoCancelUnpaid}
                onChange={(e) =>
                  setFormValues({ ...formValues, autoCancelUnpaid: e.target.checked })
                }
              />
            </label>

            <label className="settings-toggle-row">
              <div>
                <div className="settings-toggle-title">Automated Email Receipts</div>
                <div className="settings-toggle-desc">
                  Dispatch QR e-tickets and payment invoices immediately upon settlement.
                </div>
              </div>
              <input
                type="checkbox"
                className="switch-input"
                checked={formValues.emailReceipts}
                onChange={(e) =>
                  setFormValues({ ...formValues, emailReceipts: e.target.checked })
                }
              />
            </label>

            <label className="settings-toggle-row">
              <div>
                <div className="settings-toggle-title">Maintenance Alert Emails</div>
                <div className="settings-toggle-desc">
                  Notify regional managers when an auditorium status changes to Maintenance.
                </div>
              </div>
              <input
                type="checkbox"
                className="switch-input"
                checked={formValues.maintenanceAlertEmails}
                onChange={(e) =>
                  setFormValues({ ...formValues, maintenanceAlertEmails: e.target.checked })
                }
              />
            </label>
          </div>
        </div>
      </form>
    </div>
  );
}
