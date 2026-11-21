import {
  CanvasTexture, Color, Mesh, PerspectiveCamera, Raycaster, RepeatWrapping, Scene,
  ShaderMaterial, SphereGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { earthTexture } from './earth-map';
import { observerColors } from './observers';
import { polarPalette } from './polar';
import type { PolarCaps } from './polar';
import { surfacePoint, surfaceVector } from './solar';
import type { Point, SolarFrame, Vec3 } from './solar';

const toThree = ([x, y, z]: Vec3) => new Vector3(x, z, -y);

const vertexShader = `
  varying vec3 localNormal;
  void main() {
    localNormal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D basemap;
  uniform vec3 sun;
  uniform vec3 dawn;
  uniform vec3 observer;
  uniform vec3 comparisonObserver;
  uniform vec3 siteA;
  uniform vec3 siteB;
  uniform bool showComparison;
  uniform vec3 eye;
  uniform vec2 polarRange;
  uniform vec3 polarDay;
  uniform vec3 polarNight;
  varying vec3 localNormal;
  const float PI = 3.14159265359;

  vec3 marker(vec3 color, vec3 target, vec3 p, vec3 tint, float radius, float core) {
    float distanceFromCenter = length(p - target);
    float pixel = max(fwidth(distanceFromCenter), .002);
    float center = core * (1.0 - smoothstep(.013, .013 + pixel, distanceFromCenter));
    float ring = 1.0 - smoothstep(.004, .004 + pixel, abs(distanceFromCenter - radius));
    return mix(color, tint, max(center, ring * .87));
  }

  void main() {
    vec3 p = normalize(localNormal);
    vec2 uv = vec2(atan(-p.z, p.x) / (2.0 * PI) + .5, asin(clamp(p.y, -1.0, 1.0)) / PI + .5);
    vec3 surface = texture2D(basemap, uv).rgb;
    float sunAngle = dot(sun, p);
    vec3 day = mix(surface, vec3(.76, .84, .68), max(sunAngle, 0.0) * .12);
    vec3 night = mix(vec3(.027, .065, .115), surface, .34);
    float pixel = max(fwidth(sunAngle), .0015);
    vec3 color = mix(night, day, smoothstep(-pixel, pixel, sunAngle));
    if (polarRange.y != 0.0) {
      float fromBoundary = abs(p.y) - polarRange.x;
      float feather = max(fwidth(p.y), .00001);
      vec3 tint = p.y * polarRange.y > 0.0 ? polarDay : polarNight;
      float fill = smoothstep(-feather, feather, fromBoundary);
      float edge = 1.0 - smoothstep(.2 * feather, feather, abs(fromBoundary));
      color = mix(color, tint, max(.42 * fill, .83 * edge));
    }
    float side = dot(dawn, p);
    float arc = atan(side, dot(cross(sun, dawn), p));
    float line = 1.0 - smoothstep(pixel * .52, pixel * 1.5, abs(sunAngle));
    vec3 amber = vec3(1., .80, .50);
    vec3 lavender = vec3(.66, .73, .94);
    if (side < 0.0) {
      line *= step(.38, fract(arc * 17.));
    }
    color = mix(color, side >= 0.0 ? amber : lavender, line * .9);
    float limb = pow(1.0 - max(dot(p, normalize(eye - p)), 0.0), 6.0);
    color = mix(color, vec3(.36, .68, .78), limb * mix(.20, .56, smoothstep(-.18, .35, sunAngle)));
    color = marker(color, sun, p, amber, .029, 1.0);
    color = marker(color, observer, p, siteA, .029, 1.0);
    if (showComparison) {
      float core = step(.025, length(observer - comparisonObserver));
      color = marker(color, comparisonObserver, p, siteB, .047, core);
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function makeGlobe(canvas: HTMLCanvasElement, onPick: (p: Point) => void, onLost: () => void) {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, .1, 100);
  camera.position.copy(toThree(surfaceVector({ lon: 60, lat: 25 })).multiplyScalar(4.0));
  camera.lookAt(0, 0, 0);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.minDistance = 2.25;
  controls.maxDistance = 8;
  const texture = new CanvasTexture(earthTexture());
  texture.wrapS = RepeatWrapping;
  // Sampling across the longitude seam uses the neighboring edge of the same texture.
  texture.generateMipmaps = false;
  texture.minFilter = texture.magFilter;
  const geometry = new SphereGeometry(1, 96, 64);
  const material = new ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      basemap: { value: texture },
      sun: { value: new Vector3() },
      dawn: { value: new Vector3() },
      observer: { value: new Vector3() },
      comparisonObserver: { value: new Vector3() },
      siteA: { value: new Color(observerColors.A).convertLinearToSRGB() },
      siteB: { value: new Color(observerColors.B).convertLinearToSRGB() },
      showComparison: { value: false },
      eye: { value: camera.position },
      polarRange: { value: new Vector2(1, 0) },
      // The globe material writes display RGB directly, as does the 2D canvas.
      polarDay: { value: new Color(polarPalette.day).convertLinearToSRGB() },
      polarNight: { value: new Color(polarPalette.night).convertLinearToSRGB() },
    },
  });
  const sphere = new Mesh(geometry, material);
  scene.add(sphere);
  const render = () => renderer.render(scene, camera);
  controls.addEventListener('change', render);
  const size = new ResizeObserver(() => {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    // Use the narrower dimension to frame the globe on portrait displays.
    camera.fov = width < height ? 2 * Math.atan(Math.tan(35 * Math.PI / 360) * height / width) * 180 / Math.PI : 35;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  });
  size.observe(canvas);

  const ray = new Raycaster();
  let press: { id: number; x: number; y: number } | undefined;
  const pointerDown = (event: PointerEvent) => {
    press = event.isPrimary && event.button === 0 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : undefined;
  };
  const pointerMove = (event: PointerEvent) => {
    if (press?.id === event.pointerId && Math.hypot(press.x - event.clientX, press.y - event.clientY) > 5) {
      press = undefined;
    }
  };
  const pointerUp = (event: PointerEvent) => {
    const start = press;
    press = undefined;
    if (!start || start.id !== event.pointerId || Math.hypot(start.x - event.clientX, start.y - event.clientY) > 5) return;
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(new Vector2(2 * (event.clientX - rect.left) / rect.width - 1, 1 - 2 * (event.clientY - rect.top) / rect.height), camera);
    const hit = ray.intersectObject(sphere)[0];
    if (hit) onPick(surfacePoint([hit.point.x, -hit.point.z, hit.point.y]));
  };
  const keyDown = (event: KeyboardEvent) => {
    const point = surfacePoint([camera.position.x, -camera.position.z, camera.position.y]);
    const steps: Record<string, [number, number]> = { ArrowLeft: [0, -8], ArrowRight: [0, 8], ArrowUp: [8, 0], ArrowDown: [-8, 0] };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    camera.position.copy(toThree(surfaceVector({ lat: Math.max(-88, Math.min(88, point.lat + step[0])), lon: point.lon + step[1] })).multiplyScalar(camera.position.length()));
    controls.update();
    render();
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    onLost();
  };
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('keydown', keyDown);
  canvas.addEventListener('webglcontextlost', contextLost);

  return {
    draw(frame: SolarFrame, marker: Point, polarCaps: PolarCaps | null, comparison: Point | null) {
      material.uniforms.sun.value.copy(toThree(frame.direction));
      material.uniforms.dawn.value.copy(toThree(frame.dawnDirection));
      material.uniforms.observer.value.copy(toThree(surfaceVector(marker)));
      material.uniforms.showComparison.value = comparison !== null;
      if (comparison) material.uniforms.comparisonObserver.value.copy(toThree(surfaceVector(comparison)));
      const polarRange = material.uniforms.polarRange.value;
      if (polarCaps) polarRange.set(Math.sin(polarCaps.latitude * Math.PI / 180), polarCaps.dayHemisphere);
      else polarRange.set(1, 0);
      render();
    },
    center(point: Point) {
      camera.position.copy(toThree(surfaceVector({ ...point, lat: Math.max(-88, Math.min(88, point.lat)) })).multiplyScalar(4));
      controls.update();
      render();
    },
    dispose() {
      size.disconnect();
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('keydown', keyDown);
      canvas.removeEventListener('webglcontextlost', contextLost);
      controls.dispose();
      material.dispose();
      geometry.dispose();
      texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
