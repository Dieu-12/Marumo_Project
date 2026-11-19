/**
 * Pure validation utilities for all MARUMO Admin Panel forms.
 * Returns { valid: boolean, errors: Record<string, string> }.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCinemaForm(values) {
  const errors = {};
  if (!values.name?.trim()) errors.name = 'Cinema name is required.';
  if (!values.city?.trim()) errors.city = 'City is required.';
  if (!values.address?.trim()) errors.address = 'Street address is required.';
  if (!values.phone?.trim()) errors.phone = 'Contact phone is required.';

  const screens = Number(values.screens);
  if (!Number.isInteger(screens) || screens < 1 || screens > 40) {
    errors.screens = 'Screens must be a whole number between 1 and 40.';
  }

  const seats = Number(values.totalSeats);
  if (!Number.isInteger(seats) || seats < 40 || seats > 10000) {
    errors.totalSeats = 'Total seats must be between 40 and 10,000.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateMovieForm(values) {
  const errors = {};
  if (!values.title?.trim()) errors.title = 'Movie title is required.';
  if (!values.genre?.trim()) errors.genre = 'Primary genre is required.';

  const duration = Number(values.durationMinutes);
  if (!Number.isInteger(duration) || duration < 30 || duration > 360) {
    errors.durationMinutes = 'Duration must be between 30 and 360 minutes.';
  }

  if (!values.releaseDate?.trim()) errors.releaseDate = 'Release date is required.';
  if (!values.ageRating?.trim()) errors.ageRating = 'Age classification is required.';
  if (!values.director?.trim()) errors.director = 'Director name is required.';

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateShowtimeForm(values) {
  const errors = {};
  if (!values.movieId) errors.movieId = 'Please select a movie.';
  if (!values.cinemaId) errors.cinemaId = 'Please select a cinema branch.';
  if (!values.room?.trim()) errors.room = 'Screening room is required.';
  if (!values.date?.trim()) errors.date = 'Screening date is required.';
  if (!values.startTime?.trim()) errors.startTime = 'Start time is required.';

  const price = Number(values.ticketPrice);
  if (!Number.isFinite(price) || price <= 0 || price > 250) {
    errors.ticketPrice = 'Ticket price must be between $1 and $250.';
  }

  const capacity = Number(values.capacity);
  if (!Number.isInteger(capacity) || capacity < 20 || capacity > 600) {
    errors.capacity = 'Room capacity must be between 20 and 600 seats.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateManagerForm(values) {
  const errors = {};
  if (!values.name?.trim()) errors.name = 'Full name is required.';
  if (!values.email?.trim()) {
    errors.email = 'Work email is required.';
  } else if (!EMAIL_RE.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }
  if (!values.phone?.trim()) errors.phone = 'Phone number is required.';
  if (!values.role?.trim()) errors.role = 'Role is required.';
  if (!values.cinemaId) errors.cinemaId = 'Assigned cinema branch is required.';

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validatePromotionForm(values) {
  const errors = {};
  if (!values.title?.trim()) errors.title = 'Promotion title is required.';
  if (!values.code?.trim()) {
    errors.code = 'Promo code is required.';
  } else if (!/^[A-Z0-9_-]{3,20}$/.test(values.code.trim().toUpperCase())) {
    errors.code = 'Code must be 3–20 alphanumeric characters.';
  }

  const discount = Number(values.discountValue);
  if (!Number.isFinite(discount) || discount <= 0) {
    errors.discountValue = 'Discount value must be greater than 0.';
  } else if (values.discountType === 'Percentage' && discount > 90) {
    errors.discountValue = 'Percentage discount cannot exceed 90%.';
  }

  if (!values.startDate) errors.startDate = 'Start date is required.';
  if (!values.endDate) errors.endDate = 'End date is required.';
  if (values.startDate && values.endDate && values.endDate < values.startDate) {
    errors.endDate = 'End date must be on or after start date.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateSettingsForm(values) {
  const errors = {};
  if (!values.platformName?.trim()) errors.platformName = 'Platform name is required.';
  if (!values.supportEmail?.trim() || !EMAIL_RE.test(values.supportEmail.trim())) {
    errors.supportEmail = 'Valid support email is required.';
  }
  const tax = Number(values.taxRate);
  if (!Number.isFinite(tax) || tax < 0 || tax > 35) {
    errors.taxRate = 'Tax rate must be between 0% and 35%.';
  }
  const fee = Number(values.convenienceFee);
  if (!Number.isFinite(fee) || fee < 0 || fee > 25) {
    errors.convenienceFee = 'Convenience fee must be between $0 and $25.';
  }
  const holdMins = Number(values.seatHoldMinutes);
  if (!Number.isInteger(holdMins) || holdMins < 3 || holdMins > 30) {
    errors.seatHoldMinutes = 'Seat hold duration must be 3–30 minutes.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
