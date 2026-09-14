import { chromium } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';

const url = process.env.ANIMATION_EVALUATOR_URL ?? 'http://localhost:3001/landing';
const selector = process.env.ANIMATION_EVALUATOR_SELECTOR ?? '#como-funciona';
const outputDirectory = process.env.ANIMATION_EVALUATOR_OUT ?? 'out';
const [width = '1280', height = '800'] = (process.env.ANIMATION_EVALUATOR_VIEWPORT ?? '1280x800').split('x');

async function capture() {
  if (!fs.existsSync(outputDirectory)) fs.mkdirSync(outputDirectory, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator(selector).waitFor();

  // Captura el rango de scroll de la sección, no el del documento entero.
  // Así los cinco estados describen la animación incluso en landings largas.
  const steps = [0, 0.25, 0.5, 0.75, 1];
  const section = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top + window.scrollY, scrollRange: Math.max(0, rect.height - window.innerHeight) };
  });

  for (let i = 0; i < steps.length; i++) {
    const y = section.top + section.scrollRange * steps[i];
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(500); // Deja que el muelle de Framer Motion se estabilice.
    await page.screenshot({ path: `${outputDirectory}/step-${i}.png` });
  }

  await browser.close();

  // Une las capturas en una sola imagen horizontal
  // Una secuencia PNG es un único input de FFmpeg: tile la distribuye en una fila.
  execSync(`ffmpeg -y -i ${outputDirectory}/step-%d.png -vf tile=5x1 ${outputDirectory}/storyboard.png`);
  console.log(`Storyboard generado con éxito en ${outputDirectory}/storyboard.png`);
}

capture();
