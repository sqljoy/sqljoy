// Current UNIX timestamp in milliseconds, but that we set manually on each call to runTasks.
// not advancing time during computation is one of our defenses against Spectre attacks.
let NOW = Date.now();

function now() {
	return NOW;
}

export function setDate(unixTimestampMillis: number) {
	NOW = unixTimestampMillis;
}

Date = function (BuiltinDate: DateConstructor) {
	function Date(year_or_value?: number | string, month?: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): Date | string {
		if (new.target === undefined) {
			// This is the deprecated naked Date() call which returns a string
			return (new BuiltinDate(NOW)).toString();
		}
		// Otherwise it was the constructor called with new
		if (typeof year_or_value === 'string') {
			// Return the "current" time.
			return new BuiltinDate(NOW);
		}
		// Build a Date with the specified datetime
		return new BuiltinDate(year_or_value!, month!, date, hours, minutes, seconds, ms);
	}

	// Make a copy of the BuiltinDate "class" and replace the constructor,
	// It needs to be impossible for the user to grab an reference to BuiltinDate.
	Date.prototype = BuiltinDate.prototype;
	BuiltinDate.prototype.constructor = Date;

	// Add the static methods now(), UTC(), and parse() - all of which return a numeric timestamp
	Date.now = now;
	Date.parse = BuiltinDate.parse; // returns a number
	Date.UTC = BuiltinDate.UTC; // returns a number

	return Date as DateConstructor;
}(Date);
