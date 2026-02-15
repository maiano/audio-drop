const CYRILLIC_TO_LATIN: Record<string, string> = {
  // Russian
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  // Ukrainian
  є: 'ye',
  і: 'i',
  ї: 'yi',
  ґ: 'g',
};

export function transliterate(text: string): string {
  return text
    .split('')
    .map((char) => {
      const lower = char.toLowerCase();
      if (CYRILLIC_TO_LATIN[lower]) {
        return char === lower
          ? CYRILLIC_TO_LATIN[lower]
          : CYRILLIC_TO_LATIN[lower].charAt(0).toUpperCase() + CYRILLIC_TO_LATIN[lower].slice(1);
      }
      return char;
    })
    .join('');
}

export function sanitizeFilename(filename: string): string {
  // Transliterate Cyrillic
  let sanitized = transliterate(filename);

  // Remove or replace special characters
  sanitized = sanitized
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename chars
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .replace(/^_+|_+$/g, ''); // Trim underscores from start/end

  // Limit length
  const maxLength = 200;
  if (sanitized.length > maxLength) {
    const ext = sanitized.match(/\.[^.]+$/)?.[0] || '';
    sanitized = sanitized.slice(0, maxLength - ext.length) + ext;
  }

  return sanitized || 'audio';
}
