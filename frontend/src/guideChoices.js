// Only controls that change a trip selection are eligible for character assistance.
export function guideChoices(step) {
  const main = document.querySelector('.journey-app main');
  if (!main) return [];
  const choices = [];
  const buttons = ['.destination-tabs button', '.activity-postcards button', '', '.route-toggle, .catalog-place button', ''][step];
  if (buttons) {
    for (const button of main.querySelectorAll(buttons)) {
      const label = button.closest('.catalog-place')?.querySelector('h3')?.textContent || button.textContent.trim();
      choices.push({label, apply:() => {
        if (!button.isConnected) return false;
        if (button.getAttribute('aria-pressed') !== 'true') button.click();
        return true;
      }});
    }
  }
  const fields = ['', '#activity select', '#forecast select', '.nearby select', '.course-settings select'][step];
  if (fields) {
    for (const field of main.querySelectorAll(fields)) {
      for (const option of field.options) {
        choices.push({label:(field.labels[0]?.firstChild.textContent.trim() || '') + ' · ' + option.text, apply:() => {
          if (!field.isConnected || field.disabled) return false;
          field.value = option.value;
          field.dispatchEvent(new Event('change',{bubbles:true}));
          return true;
        }});
      }
    }
  }
  if (step === 1) {
    const children = main.querySelector('#activity input[type="checkbox"]');
    if (children) for (const [label,checked] of [['어린이와 함께',true],['어린이 동반 안 함',false]]) {
      choices.push({label,apply:()=>{
        if (!children.isConnected) return false;
        if (children.checked !== checked) children.click();
        return true;
      }});
    }
  }
  return choices.slice(0,100);
}
