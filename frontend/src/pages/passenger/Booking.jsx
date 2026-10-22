import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import {
  fareNum,
  getRoute,
  getScheduleRows,
  routeLabel,
  syncFleetConfig,
} from '../../data/fleetData';

const todayISO = new Date().toISOString().slice(0, 10);

const ports = [
  'Roxas, Oriental Mindoro',
  'Caticlan, Malay, Aklan',
  'Odiongan, Romblon',
];

const paymentMethods = ['GCash', 'Maya', 'Credit / Debit Card', 'Bank Transfer'];
const DISCOUNTS = { Regular: 0, PWD: 0.20, 'Senior Citizen': 0.20, Child: 0.50 };

function passengerFare(passenger, baseFare) {
  const discount = DISCOUNTS[passenger.discountType] || 0;
  return Math.round(fareNum(baseFare) * (1 - discount) * 100) / 100;
}

function makePassenger(index, session) {
  return {
    name: index === 0 ? session?.name || '' : '',
    age: '',
    gender: 'Male',
    contact: index === 0 ? '' : '',
    discountType: 'Regular',
    pwdId: '',
    seniorId: '',
    childProof: '',
  };
}

function formatDate(date) {
  if (!date) return '-';

  return new Intl.DateTimeFormat('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00`));
}

export default function Booking({ onNavigate }) {
  const { session, createBooking, viewTicket } = useData();
  const showToast = useToast();

  const [step, setStep] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [savedBooking, setSavedBooking] = useState(null);

  const [search, setSearch] = useState({
    from: 'Roxas, Oriental Mindoro',
    to: 'Caticlan, Malay, Aklan',
    date: '',
    qty: 1,
  });

  const [selectedSchedule, setSelectedSchedule] = useState('');
  const [passengers, setPassengers] = useState([makePassenger(0, session)]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [payment, setPayment] = useState('GCash');
  const [fleetVersion, setFleetVersion] = useState(0);
  const [selectedScheduleRow, setSelectedScheduleRow] = useState(null);

  const route = useMemo(
    () => getRoute(search.from, search.to),
    [search.from, search.to]
  );

  const schedules = useMemo(
    () => getScheduleRows(route, search.date),
    [route, search.date, fleetVersion]
  );

  const baseFare = route ? fareNum(selectedScheduleRow?.fare ?? route.fare) : 0;
  const amount = passengers.reduce((sum, passenger) => sum + passengerFare(passenger, baseFare), 0);

  useEffect(() => {
    let active = true;
    const refreshFleet = async () => {
      await syncFleetConfig();
      if (active) setFleetVersion((value) => value + 1);
    };

    refreshFleet();
    const onFleetChange = () => setFleetVersion((value) => value + 1);
    window.addEventListener('route-fare-updated', onFleetChange);
    window.addEventListener('schedule-updated', onFleetChange);
    const poll = window.setInterval(refreshFleet, 2500);

    return () => {
      active = false;
      window.clearInterval(poll);
      window.removeEventListener('route-fare-updated', onFleetChange);
      window.removeEventListener('schedule-updated', onFleetChange);
    };
  }, []);

  function updateSearch(name, value) {
    setSearch((current) => {
      const next = { ...current, [name]: value };

      if (name === 'from' && next.to === value) {
        next.to = ports.find((port) => port !== value) || '';
      }

      return next;
    });
  }

  async function handleSearch(event) {
    event.preventDefault();

    await syncFleetConfig();
    setFleetVersion((value) => value + 1);

    if (!route) {
      showToast('No configured Montenegro route for this port pair.');
      return;
    }

    setSelectedSchedule('');
    setSelectedScheduleRow(null);
    setStep(2);
  }

  function selectSchedule(row) {
    const available = Math.max(0, Number(row.capacity || 0) - Number(row.booked || 0));
    if (Number(search.qty) > available) {
      showToast(`Only ${available} seat(s) are available for this schedule.`);
      return;
    }

    setSelectedSchedule(row.time);
    setSelectedScheduleRow(row);
    setStep(3);
  }

  function updatePassenger(index, name, value) {
    setPassengers((current) =>
      current.map((passenger, passengerIndex) =>
        passengerIndex === index
          ? { ...passenger, [name]: value }
          : passenger
      )
    );
  }

  function addPassenger() {
    if (passengers.length >= Number(search.qty)) {
      showToast(`You selected ${search.qty} passenger(s).`);
      return;
    }

    setPassengers((current) => [
      ...current,
      makePassenger(current.length, session),
    ]);
  }

  function removePassenger(index) {
    if (index === 0) return;

    setPassengers((current) =>
      current.filter((_, passengerIndex) => passengerIndex !== index)
    );
  }

  function continuePassengerDetails(event) {
    event.preventDefault();

    const complete = passengers.length === Number(search.qty) &&
      passengers.every(
        (passenger) =>
          passenger.name.trim() &&
          passenger.age &&
          passenger.gender &&
          passenger.contact.trim() &&
          (passenger.discountType !== 'PWD' || passenger.pwdId.trim()) &&
          (passenger.discountType !== 'Senior Citizen' || (Number(passenger.age) >= 60 && passenger.seniorId.trim())) &&
          (passenger.discountType !== 'Child' || (Number(passenger.age) <= 11 && passenger.childProof.trim()))
      );

    if (!complete) {
      showToast('Complete every passenger detail. Senior citizens and PWDs need a valid ID/reference; children need proof of age.');
      return;
    }

    setStep(4);
  }

  function toggleSeat(seat) {
    setSelectedSeats((current) => {
      if (current.includes(seat)) {
        return current.filter((item) => item !== seat);
      }

      if (current.length >= Number(search.qty)) {
        showToast(`You can select only ${search.qty} seat(s).`);
        return current;
      }

      return [...current, seat];
    });
  }

  function continueSeatSelection() {
    if (selectedSeats.length !== Number(search.qty)) {
      showToast(`Please select ${search.qty} seat(s).`);
      return;
    }

    setStep(5);
  }

  async function completePayment() {
    if (processing) return;

    setProcessing(true);
    setStep(7);

    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const booking = await createBooking({
        name: passengers[0].name,
        contact: passengers[0].contact,
        route: routeLabel(route),
        date: search.date,
        schedule: selectedSchedule,
        scheduleKey: selectedScheduleRow?.id || null,
        qty: Number(search.qty),
        accom: 'Economy',
        payment,
        vessel: selectedScheduleRow?.vessel || route.vessel,
        seats: selectedSeats,
        passengers,
        fare: selectedScheduleRow?.fare ?? route.fare,
        fareBreakdown: passengers.map((passenger) => ({
          name: passenger.name,
          age: Number(passenger.age),
          discountType: passenger.discountType || 'Regular',
          discountPercent: Math.round((DISCOUNTS[passenger.discountType] || 0) * 100),
          discountIdType: passenger.discountType === 'PWD' ? 'PWD ID' : passenger.discountType === 'Senior Citizen' ? 'Senior Citizen ID' : passenger.discountType === 'Child' ? passenger.childProof : '',
          discountIdReference: passenger.discountType === 'PWD' ? passenger.pwdId : passenger.discountType === 'Senior Citizen' ? passenger.seniorId : '',
          baseFare: baseFare,
          discountAmount: Math.round(baseFare * (DISCOUNTS[passenger.discountType] || 0) * 100) / 100,
          finalFare: passengerFare(passenger, baseFare),
        })),
        paid: true,
        status: 'Pending',
      });

      setSavedBooking(booking);
      setStep(8);
      showToast('Payment successful. Your booking is now waiting for admin confirmation.');
    } catch (error) {
      console.error('Booking flow failed:', error);
      showToast(error.message || 'Payment could not be completed.');
      setStep(6);
    } finally {
      setProcessing(false);
    }
  }

  function resetFlow() {
    setStep(1);
    setSelectedSchedule('');
    setSelectedScheduleRow(null);
    setSelectedSeats([]);
    setSavedBooking(null);
    setPassengers([makePassenger(0, session)]);
  }

  if (step === 1) {
    return (
      <div className="panel">
        <h3 className="section-title">Search Trip</h3>
        <p className="sub">
          Search Montenegro trips operating through Roxas, Oriental Mindoro.
        </p>

        <form className="form" onSubmit={handleSearch}>
          <label className="field">
            From
            <select
              value={search.from}
              onChange={(event) => updateSearch('from', event.target.value)}
              required
            >
              {ports.map((port) => (
                <option key={port}>{port}</option>
              ))}
            </select>
          </label>

          <label className="field">
            To
            <select
              value={search.to}
              onChange={(event) => updateSearch('to', event.target.value)}
              required
            >
              {ports
                .filter((port) => port !== search.from)
                .map((port) => (
                  <option key={port}>{port}</option>
                ))}
            </select>
          </label>

          <label className="field">
            Departure date
            <input
              type="date"
              min={todayISO}
              value={search.date}
              onChange={(event) => updateSearch('date', event.target.value)}
              required
            />
          </label>

          <label className="field">
            Passengers
            <select
              value={search.qty}
              onChange={(event) => {
                const qty = Number(event.target.value);
                updateSearch('qty', qty);
                setPassengers((current) =>
                  Array.from({ length: qty }, (_, index) =>
                    current[index] || makePassenger(index, session)
                  )
                );
                setSelectedSeats([]);
              }}
            >
              {[1, 2, 3, 4, 5, 6].map((count) => (
                <option key={count} value={count}>
                  {count} Passenger{count > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </label>

          <button className="btn primary fullcol">Search Schedules →</button>
        </form>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Select Schedule</h3>
            <span>{formatDate(search.date)}</span>
          </div>
          <button className="btn" type="button" onClick={() => setStep(1)}>
            ← Back
          </button>
        </div>

        <div className="route-row" style={{ marginBottom: 15 }}>
          <div>
            <b>{search.from}</b>
            <small>to {search.to}</small>
          </div>
          <strong>{search.qty} pax</strong>
        </div>

        {schedules.length === 0 ? (
          <div className="empty">
            <b>No scheduled trip found for this date.</b>
            <div style={{ marginTop: 8 }}>
              Roxas–Odiongan trips currently configured here run Tuesday and Friday.
            </div>
          </div>
        ) : (
          <div className="route-list">
            {schedules.map((row) => {
              const available = Math.max(0, Number(row.capacity || 0) - Number(row.booked || 0));
              return (
              <div
                key={row.id}
                className="schedule-option"
              >
                <div className="schedule-option-details">
                  <b>{row.time}</b>
                  <small>{row.vessel} · {route?.duration} · {row.days}</small>
                  <strong>₱{fareNum(row.fare ?? route?.fare).toLocaleString()} / passenger</strong>
                  <small>{available} seat(s) available</small>
                </div>
                <button
                  className="btn primary schedule-select-button"
                  type="button"
                  disabled={available < Number(search.qty)}
                  onClick={() => selectSchedule(row)}
                >
                  {available < Number(search.qty) ? 'Not enough seats' : 'Select this schedule →'}
                </button>
              </div>
              );
            })}
          </div>
        )}

        <p className="sub" style={{ marginTop: 18, marginBottom: 0 }}>
          Schedules are indicative and may change due to port or weather advisories.
        </p>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Passenger Details</h3>
            <span>{passengers.length} of {search.qty} passenger(s)</span>
          </div>
          <button className="btn" type="button" onClick={() => setStep(2)}>
            ← Back
          </button>
        </div>

        <form className="form" onSubmit={continuePassengerDetails}>
          {passengers.map((passenger, index) => (
            <div
              key={index}
              style={{
                gridColumn: '1 / -1',
                border: '1px solid var(--line)',
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div className="panel-head">
                <div>
                  <b>Passenger {index + 1}</b>
                  <span>{index === 0 ? 'Primary passenger' : 'Additional passenger'}</span>
                </div>
                {index > 0 && (
                  <button
                    className="mini redbtn"
                    type="button"
                    onClick={() => removePassenger(index)}
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="form">
                <label className="field">
                  Full name
                  <input
                    value={passenger.name}
                    onChange={(event) =>
                      updatePassenger(index, 'name', event.target.value)
                    }
                    required
                  />
                </label>

                <label className="field">
                  Age
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={passenger.age}
                    onChange={(event) =>
                      updatePassenger(index, 'age', event.target.value)
                    }
                    required
                  />
                </label>

                <label className="field">
                  Gender
                  <select
                    value={passenger.gender}
                    onChange={(event) =>
                      updatePassenger(index, 'gender', event.target.value)
                    }
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </label>

                <label className="field">
                  Passenger type / discount
                  <select
                    value={passenger.discountType || 'Regular'}
                    onChange={(event) => updatePassenger(index, 'discountType', event.target.value)}
                  >
                    <option value="Regular">Regular — no discount</option>
                    <option value="PWD">PWD — 20% discount</option>
                    <option value="Senior Citizen">Senior Citizen — 20% discount (60+)</option>
                    <option value="Child">Child — 50% discount (11 and below)</option>
                  </select>
                  <small style={{ color: 'var(--muted)' }}>
                    {passenger.discountType === 'PWD' ? 'Enter the PWD ID/reference below.' : passenger.discountType === 'Senior Citizen' ? 'Age must be 60 or older.' : passenger.discountType === 'Child' ? 'Child must be 11 years old or younger.' : 'Discounts are calculated per passenger.'}
                  </small>
                </label>

                {passenger.discountType === 'PWD' && (
                  <label className="field">
                    PWD ID number (required)
                    <input
                      value={passenger.pwdId || ''}
                      onChange={(event) => updatePassenger(index, 'pwdId', event.target.value)}
                      placeholder="Enter PWD ID number"
                      autoComplete="off"
                      required
                    />
                  </label>
                )}

                {passenger.discountType === 'Senior Citizen' && (
                  <label className="field">
                    Senior Citizen ID number (required)
                    <input
                      value={passenger.seniorId || ''}
                      onChange={(event) => updatePassenger(index, 'seniorId', event.target.value)}
                      placeholder="Enter Senior Citizen ID number"
                      autoComplete="off"
                      required
                    />
                    <small style={{ color: 'var(--muted)' }}>Bring the original valid Senior Citizen ID for verification at the port.</small>
                  </label>
                )}

                {passenger.discountType === 'Child' && (
                  <label className="field">
                    Child proof of age (required)
                    <select
                      value={passenger.childProof || ''}
                      onChange={(event) => updatePassenger(index, 'childProof', event.target.value)}
                      required
                    >
                      <option value="">Select proof document</option>
                      <option value="Birth Certificate">Birth Certificate</option>
                      <option value="School ID">School ID</option>
                      <option value="Passport">Passport</option>
                      <option value="Other government-issued document">Other government-issued document</option>
                    </select>
                    <small style={{ color: 'var(--muted)' }}>Bring the selected document to verify the child's age at the port.</small>
                  </label>
                )}

                <label className="field">
                  Contact number
                  <input
                    value={passenger.contact}
                    onChange={(event) =>
                      updatePassenger(index, 'contact', event.target.value)
                    }
                    placeholder="09XXXXXXXXX"
                    required
                  />
                </label>
              </div>
            </div>
          ))}

          {passengers.length < Number(search.qty) && (
            <button className="btn" type="button" onClick={addPassenger}>
              + Add Passenger
            </button>
          )}

          <button className="btn primary fullcol">Continue →</button>
        </form>
      </div>
    );
  }

  if (step === 4) {
    const seats = Array.from({ length: 20 }, (_, index) => {
      const row = Math.floor(index / 4) + 1;
      const letter = ['A', 'B', 'C', 'D'][index % 4];
      return `${row}${letter}`;
    });

    return (
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Seat Selection</h3>
            <span>{selectedSeats.length} of {search.qty} selected</span>
          </div>
          <button className="btn" type="button" onClick={() => setStep(3)}>
            ← Back
          </button>
        </div>

        <div className="route-row" style={{ marginBottom: 16 }}>
          <div>
            <b>{routeLabel(route)}</b>
            <small>{selectedSchedule} · {route?.vessel}</small>
          </div>
          <strong>{formatDate(search.date)}</strong>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(55px, 1fr))',
            gap: 8,
            maxWidth: 430,
            margin: '0 auto 18px',
          }}
        >
          {seats.map((seat) => {
            const selected = selectedSeats.includes(seat);

            return (
              <button
                key={seat}
                type="button"
                onClick={() => toggleSeat(seat)}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 9,
                  padding: '10px 6px',
                  background: selected ? 'var(--blue)' : '#fff',
                  color: selected ? '#fff' : 'var(--ink)',
                  fontWeight: 800,
                }}
              >
                {seat}
              </button>
            );
          })}
        </div>

        <button className="btn primary full" type="button" onClick={continueSeatSelection}>
          Continue →
        </button>
      </div>
    );
  }

  if (step === 5) {
    return (
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Trip Summary</h3>
            <span>Review passenger discounts and total before payment</span>
          </div>
          <button className="btn" type="button" onClick={() => setStep(4)}>
            ← Back
          </button>
        </div>

        <div className="route-row">
          <div>
            <b>{routeLabel(route)}</b>
            <small>{formatDate(search.date)} · {selectedSchedule}</small>
          </div>
          <strong>{route?.vessel}</strong>
        </div>

        <div className="table" style={{ marginTop: 15 }}>
          <table>
            <tbody>
              {passengers.map((passenger, index) => (
                <tr key={index}>
                  <td>Passenger {index + 1}</td>
                  <td>{passenger.name}</td>
                  <td>{passenger.age} yrs</td>
                  <td>{selectedSeats[index]}</td>
                  <td>{passenger.discountType || 'Regular'}{(DISCOUNTS[passenger.discountType] || 0) > 0 ? ` (${Math.round(DISCOUNTS[passenger.discountType] * 100)}% off)` : ''}</td>
                  <td>
                    {(DISCOUNTS[passenger.discountType] || 0) > 0 && <small style={{ display: 'block', color: 'var(--muted)', textDecoration: 'line-through' }}>₱{baseFare.toLocaleString()}</small>}
                    <b>₱{passengerFare(passenger, baseFare).toLocaleString()}</b>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan="5"><b>Total fare after discounts</b></td>
                <td><b>₱{Number(savedBooking?.amount ?? amount).toLocaleString()}</b></td>
              </tr>
            </tbody>
          </table>
        </div>

        <button className="btn primary fullcol full" type="button" onClick={() => setStep(6)}>
          Proceed to Payment →
        </button>
      </div>
    );
  }

  if (step === 6) {
    return (
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Payment Method</h3>
            <span>Total amount ₱{amount.toLocaleString()}</span>
          </div>
          <button className="btn" type="button" onClick={() => setStep(5)}>
            ← Back
          </button>
        </div>

        <div className="form">
          {paymentMethods.map((method) => (
            <label
              key={method}
              className="field"
              style={{
                border: payment === method ? '2px solid var(--blue)' : '1px solid var(--line)',
                borderRadius: 11,
                padding: 12,
                cursor: 'pointer',
              }}
            >
              <span>
                <input
                  type="radio"
                  name="payment"
                  value={method}
                  checked={payment === method}
                  onChange={(event) => setPayment(event.target.value)}
                  style={{ width: 'auto', marginRight: 8 }}
                />
                {method}
              </span>
            </label>
          ))}
        </div>

        <div className="route-row" style={{ marginTop: 16 }}>
          <b>Total Amount</b>
          <strong>₱{amount.toLocaleString()}</strong>
        </div>

        <button className="btn primary fullcol full" type="button" onClick={completePayment}>
          Pay Now
        </button>
      </div>
    );
  }

  if (step === 7) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: 45 }}>
        <div style={{ fontSize: 54, marginBottom: 12 }}>✓</div>
        <h3 className="section-title">Payment Processing</h3>
        <p className="sub">
          Please wait while your payment is being processed.
        </p>
        <div className="route-row" style={{ maxWidth: 420, margin: '20px auto' }}>
          <b>{payment}</b>
          <strong>₱{amount.toLocaleString()}</strong>
        </div>
        <button className="btn primary" type="button" disabled={processing}>
          Processing...
        </button>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Booking Confirmed!</h3>
          <span>Your ticket is ready</span>
        </div>
        <span className="badge green">PAID</span>
      </div>

      <div className="route-row">
        <div>
          <b>{passengers[0]?.name}</b>
          <small>{routeLabel(route)}</small>
        </div>
        <strong>{savedBooking?.id}</strong>
      </div>

      <div className="table" style={{ marginTop: 15 }}>
        <table>
          <tbody>
            <tr>
              <td>Date</td>
              <td>{formatDate(search.date)}</td>
            </tr>
            <tr>
              <td>Departure</td>
              <td>{selectedSchedule}</td>
            </tr>
            <tr>
              <td>Vessel</td>
              <td>{route?.vessel}</td>
            </tr>
            <tr>
              <td>Seats</td>
              <td>{selectedSeats.join(', ')}</td>
            </tr>
            <tr>
              <td>Total</td>
              <td><b>₱{Number(savedBooking?.amount ?? amount).toLocaleString()}</b></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="actions" style={{ marginTop: 18 }}>
        <button
          className="btn primary"
          type="button"
          onClick={() => savedBooking && viewTicket(savedBooking.id)}
        >
          View My Ticket
        </button>
        <button className="btn" type="button" onClick={() => onNavigate('bookings')}>
          My Bookings
        </button>
        <button className="btn" type="button" onClick={resetFlow}>
          Book Another Trip
        </button>
      </div>
    </div>
  );
}
