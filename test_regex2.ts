const ADDITIVE_AFFIX_REGEX = /^[+]\s*[\d., ]*\d[\d., ]*%?\s+[A-Za-z].+/

console.log(ADDITIVE_AFFIX_REGEX.test('+3 to The Best Offense'))
