export default () => {
	const date = new Date();
	const padField = (field, padding) => String(field).padStart(padding, '0');

	return `${padField(date.getHours(), 2)}:${padField(
		date.getMinutes(),
		2
	)}:${padField(date.getSeconds(), 2)}.${padField(date.getMilliseconds(), 3)}`;
};
