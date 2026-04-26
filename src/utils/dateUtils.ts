import { format, parseISO, parse, isValid } from 'date-fns';

export const parseDate = (dateValue: string | number | Date | undefined | null): Date | null => {
  if (!dateValue) return null;
  
  if (dateValue instanceof Date) {
    return isValid(dateValue) ? dateValue : null;
  }
  
  try {
    if (typeof dateValue === 'number') {
      const date = new Date((dateValue - 25569) * 86400 * 1000);
      return isValid(date) ? date : null;
    }

    const strValue = String(dateValue).trim();
    if (!strValue) return null;

    // Try parsing with known formats
    const formats = [
      'yyyy-MM-dd',
      'dd-MM-yyyy',
      'dd/MM/yyyy',
      'yyyy/MM/dd'
    ];

    for (const fmt of formats) {
      const parsed = parse(strValue, fmt, new Date());
      if (isValid(parsed) && parsed.getFullYear() > 1900) {
        return parsed;
      }
    }

    // Try ISO
    const isoDate = parseISO(strValue);
    if (isValid(isoDate) && isoDate.getFullYear() > 1900) return isoDate;

    // Fallback to native Date
    const nativeDate = new Date(strValue);
    if (isValid(nativeDate) && nativeDate.getFullYear() > 1900) return nativeDate;

    return null;
  } catch (e) {
    return null;
  }
};

export const formatDate = (dateValue: string | number | Date | undefined | null, formatStr = 'dd-MM-yyyy') => {
  const date = parseDate(dateValue);
  if (!date) return dateValue ? dateValue.toString() : '-';
  return format(date, formatStr);
};

export const formatDateTime = (dateValue: string | number | Date | undefined | null, formatStr = 'dd-MM-yyyy HH:mm') => {
  const date = parseDate(dateValue);
  if (!date) return dateValue ? dateValue.toString() : '-';
  return format(date, formatStr);
};
