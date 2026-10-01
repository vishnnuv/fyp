const trainData = require('../data/mock_train_data_v2.json');

const DAY_MAP = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

// Normalize city names (handle common variants)
const CITY_ALIASES = {
  'bengaluru': 'Bangalore',
  'bangalore': 'Bangalore',
  'chennai': 'Chennai',
  'madras': 'Chennai',
  'coimbatore': 'Coimbatore',
  'kovai': 'Coimbatore',
  'mumbai': 'Mumbai',
  'bombay': 'Mumbai',
};

const SUPPORTED_CITIES = [...new Set(trainData.flatMap((train) => [train.source, train.destination]))].sort();

function normalizeCity(city) {
  if (!city) return null;
  const lower = city.toLowerCase().trim();
  return CITY_ALIASES[lower] || (city.charAt(0).toUpperCase() + city.slice(1));
}

function isSupportedCity(city) {
  const normalized = normalizeCity(city);
  return SUPPORTED_CITIES.find((supported) => supported.toLowerCase() === (normalized || '').toLowerCase()) || null;
}

function parseTravelDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const value = dateStr.trim().toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let date = null;

  if (value === 'today') date = new Date(today);
  else if (value === 'tomorrow') {
    date = new Date(today);
    date.setDate(date.getDate() + 1);
  } else {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = value.replace(/^next\s+/, '');
    if (days.includes(dayName)) {
      date = new Date(today);
      const daysAway = (days.indexOf(dayName) - today.getDay() + 7) % 7 || 7;
      date.setDate(date.getDate() + daysAway);
    } else {
      const parsed = new Date(dateStr);
      if (!Number.isNaN(parsed.getTime())) {
        date = parsed;
        date.setHours(0, 0, 0, 0);
      }
    }
  }

  if (!date || Number.isNaN(date.getTime())) return null;
  return date;
}

function getDayAbbrev(dateStr) {
  if (!dateStr) return null;
  // Handle relative terms
  const date = parseTravelDate(dateStr);
  if (!date) return null;
  return DAY_MAP[date.getDay()];
}

function searchTrains({ source, destination, date, time_preference, travel_class }) {
  const normSource = normalizeCity(source);
  const normDest = normalizeCity(destination);

  if (!normSource || !normDest) return [];

  const dayAbbrev = getDayAbbrev(date);

  let results = trainData.filter((train) => {
    const srcMatch = train.source.toLowerCase() === normSource.toLowerCase();
    const destMatch = train.destination.toLowerCase() === normDest.toLowerCase();
    const dayMatch = !dayAbbrev || train.days_of_run.includes(dayAbbrev);
    return srcMatch && destMatch && dayMatch;
  });

  // Filter by time_preference if provided
  if (time_preference) {
    const pref = time_preference.toLowerCase();
    results = results.filter((train) => {
      const hour = parseInt(train.departure_time.split(':')[0], 10);
      if (pref.includes('morning')) return hour >= 4 && hour < 12;
      if (pref.includes('afternoon')) return hour >= 12 && hour < 17;
      if (pref.includes('evening')) return hour >= 17 && hour < 21;
      if (pref.includes('night')) return hour >= 21 || hour < 4;
      return true;
    });
  }

  // Filter by travel_class if provided. "AC"/"non-AC" wording is resolved
  // through the normalized category, so it matches every AC-typed class
  // (Chair Car, Executive Chair Car, ...) consistently.
  if (travel_class) {
    const classLower = travel_class.toLowerCase();
    const category = classCategoryOf(classLower);
    results = results.filter((train) => (category
      ? train.classes.some((c) => c.category === category)
      : train.classes.some((c) => c.type.toLowerCase().includes(classLower) || classLower.includes(c.type.toLowerCase()))
    ));
  }

  // Return max 4 results
  return results.slice(0, 4);
}

function routeExists(source, destination) {
  const normalizedSource = isSupportedCity(source);
  const normalizedDestination = isSupportedCity(destination);
  return Boolean(normalizedSource && normalizedDestination && trainData.some((train) =>
    train.source === normalizedSource && train.destination === normalizedDestination
  ));
}

// Maps free-form class wording onto the normalized `category` field
// ("AC" | "Non-AC") that every class object carries. Returns null when the
// value names a concrete class type (Sleeper, Chair Car, ...) instead.
function classCategoryOf(value) {
  const text = String(value ?? '').toLowerCase().trim();
  if (!text) return null;
  if (/^(non[\s-]?ac|non[\s-]?air[\s-]?conditioned)$/.test(text)) return 'Non-AC';
  if (/^(ac|a\/c|air[\s-]?conditioned)$/.test(text)) return 'AC';
  return null;
}

function getTrainByNumber(trainNumber) {
  if (!trainNumber) return null;
  return trainData.find((train) => train.train_number === String(trainNumber)) || null;
}

module.exports = {
  searchTrains, normalizeCity, isSupportedCity, getDayAbbrev, parseTravelDate,
  routeExists, classCategoryOf, getTrainByNumber, SUPPORTED_CITIES,
};
