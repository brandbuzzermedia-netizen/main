/** SMS segments: GSM-7 160/153, otherwise UCS-2 70/67. Used for cost display and limits. */
export function smsSegments(text: string): number {
  const gsm = /^[\n\r @£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/.test(text);
  const [single, multi] = gsm ? [160, 153] : [70, 67];
  const len = [...text].length;
  return len <= single ? 1 : Math.ceil(len / multi);
}
