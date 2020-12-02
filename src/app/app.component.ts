import { DOCUMENT } from '@angular/common';
import { isNull } from '@angular/compiler/src/output/output_ast';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  NgZone,
  OnInit,
  ViewChild,
} from '@angular/core';
import {
  ActionManager,
  Animation,
  ArcRotateCamera,
  Color3,
  Color4,
  CubeTexture,
  DirectionalLight,
  Engine,
  ExecuteCodeAction,
  FresnelParameters,
  GPUParticleSystem,
  HemisphericLight,
  IParticleSystem,
  Mesh,
  MeshBuilder,
  NoiseProceduralTexture,
  ParticleHelper,
  ParticleSystem,
  Scene,
  ShadowGenerator,
  SphereParticleEmitter,
  StandardMaterial,
  Texture,
  Vector3,
} from '@babylonjs/core';
import {
  GrassProceduralTexture,
  WoodProceduralTexture,
} from '@babylonjs/procedural-textures';
import { Constants } from './constants';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss', 'app.component-lg.scss'],
})
export class AppComponent implements OnInit, AfterViewInit {
  @ViewChild('rCanvas', { static: true })
  canvasRef: ElementRef<HTMLCanvasElement>;

  clickNumber: number;

  private engine: Engine;
  private scene: Scene;

  readonly rotationAnim = new Animation(
    'rotate',
    'rotation.y',
    Constants.FPS,
    Animation.ANIMATIONTYPE_FLOAT,
    Animation.ANIMATIONLOOPMODE_CYCLE
  );
  readonly wobbleAnim = new Animation(
    'wobble',
    'position.y',
    Constants.FPS,
    Animation.ANIMATIONTYPE_FLOAT,
    Animation.ANIMATIONLOOPMODE_RELATIVE
  );

  constructor(
    private readonly ngZone: NgZone,
    @Inject(DOCUMENT) readonly document: Document
  ) {
    this.canvasRef = {} as ElementRef<HTMLCanvasElement>;
    this.engine = new Engine(this.canvasRef.nativeElement);
    this.clickNumber = 0;
    this.scene = new Scene(this.engine);
  }

  ngOnInit(): void {
    this.createScene(this.canvasRef);
  }

  ngAfterViewInit(): void {
    // start the engine
    // be aware that we have to setup the scene before
    this.ngZone.runOutsideAngular(() => {
      let freshRender = true;
      const element = this.document.getElementById('fpsLabel');

      this.engine.runRenderLoop(() => {
        if (element) {
          element.innerHTML = this.engine.getFps().toFixed() + ' fps';
        }

        if (freshRender) {
          this.engine.resize();
          freshRender = false;
        }

        if (this.scene.activeCamera) {
          this.scene.render();
        }
      });
      window.addEventListener('resize', () => this.engine.resize());
    });
  }

  private createCamera(
    scene: Scene,
    hTMLCanvasElement: HTMLCanvasElement
  ): ArcRotateCamera {
    const camera = new ArcRotateCamera(
      'camera',
      0,
      0,
      10,
      Vector3.Zero(),
      scene
    );
    camera.setPosition(new Vector3(0, 5, -10));
    camera.attachControl(hTMLCanvasElement, true);
    camera.upperBetaLimit = Math.PI / 2;
    camera.lowerRadiusLimit = 4;
    return camera;
  }

  /**
   * An important thing to remember, is that for security reasons, web browsers don't allow local files to be accessed for web pages.
   * This includes any texture files you are using. You can use a local server or an image hosting service that is CORS enabled.
   * @param scene Local File Access
   */
  private createGround(scene: Scene): Mesh {
    const ground = Mesh.CreateGround('Mirror', 100, 100, 1, scene);
    const groundMaterial = new StandardMaterial('ground', scene);
    ground.scaling = new Vector3(1, 0.01, 1);
    ground.material = groundMaterial;
    const groundTexture = new GrassProceduralTexture(
      'woodProceduralTexture',
      2048,
      scene
    );
    groundMaterial.ambientTexture = groundTexture;
    // ground.material.wireframe = true;
    ground.position = new Vector3(0, -2, 0);
    return ground;
  }

  private createLight(scene: Scene): DirectionalLight {
    const light = new DirectionalLight(
      'light',
      new Vector3(-0.5, -1, -0.5),
      scene
    );
    light.intensity = 0.7;
    light.diffuse = new Color3(1, 1, 1);
    light.specular = new Color3(1, 1, 1);
    light.position = new Vector3(20, 40, 20);
    return light;
  }

  /**
   * On Safari GPUParticleSystem.IsSupported === false and with ParticleSystem we have 21fps compared to Chrome with 60fps
   * not yet usable
   */
  private createParticleSystem(scene: Scene): void {
    // The Orb is made of several particle systems
    const sphereSpark = MeshBuilder.CreateSphere(
      'sphereSpark',
      { diameter: 0.4, segments: 32 },
      scene
    );
    const sphereSmoke = MeshBuilder.CreateSphere(
      'sphereSmoke',
      { diameter: 1.9, segments: 32 },
      scene
    );

    sphereSpark.isVisible = false;
    sphereSmoke.isVisible = false;

    // 1st Particle Sytem - Circles
    ParticleHelper.CreateFromSnippetAsync('2JRD1A#2', scene, false); // 2nd Particle Sytem - Core
    ParticleHelper.CreateFromSnippetAsync('EXUQ7M#5', scene, false); // 3rd Particle Sytem - Sparks
    ParticleHelper.CreateFromSnippetAsync('UY098C#3', scene, false).then(
      (system: IParticleSystem) => (system.emitter = sphereSpark)
    ); // 4th Particle Sytem - Smoke
    ParticleHelper.CreateFromSnippetAsync('UY098C#6', scene, false).then(
      (system: IParticleSystem) => (system.emitter = sphereSmoke)
    );
  }

  private createScene(canvasRef: ElementRef<HTMLCanvasElement>): void {
    const canvas = canvasRef.nativeElement;

    if (window.innerWidth < 415) {
      canvas.style.height = '100vh';
      canvas.style.width = '100%';
    }

    this.engine = new Engine(canvas, true);
    this.scene = new Scene(this.engine);

    const camera = this.createCamera(this.scene, canvas);
    const shadowGenerator = new ShadowGenerator(
      1024,
      this.createLight(this.scene)
    );

    // background color
    this.scene.clearColor = new Color4(0.5, 0.5, 0.5, 1);

    // create ground and receive shadows
    this.createGround(this.scene).receiveShadows = true;

    this.projectShadow(shadowGenerator, this.createTorus(this.scene));

    this.createParticleSystem(this.scene);

    this.createSkyBox(this.scene);

    // Fog
    this.scene.fogMode = Scene.FOGMODE_EXP;
    this.scene.fogColor = new Color3(0.9, 0.9, 0.9);
    this.scene.fogStart = 20;
    this.scene.fogEnd = 60;
    this.scene.fogDensity = 0.02;

    this.scene.registerBeforeRender(() => {
      camera.alpha += 0.001 * this.scene.getAnimationRatio();
    });
  }

  private createSkyBox(scene: Scene): void {
    // Skybox
    const skybox = Mesh.CreateBox('skyBox', 100.0, scene);
    const skyboxMaterial = new StandardMaterial('skyBox', scene);
    skyboxMaterial.backFaceCulling = false;
    skyboxMaterial.reflectionTexture = new CubeTexture(
      'https://github.com/andrei0mihai/babylonjs/blob/master/src/assets/textures/skybox',
      scene
    );
    skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
    skyboxMaterial.diffuseColor = new Color3(0, 0, 0);
    skyboxMaterial.specularColor = new Color3(0, 0, 0);
    skyboxMaterial.disableLighting = true;
    skybox.material = skyboxMaterial;
  }

  private createTorus(scene: Scene): Mesh {
    const torus = MeshBuilder.CreateTorus('torus', { diameter: 1 }, scene);
    torus.position = new Vector3(0, 2, 0);

    // add material	to mesh
    const torusMaterial = new StandardMaterial('torusMaterial', scene);
    torus.material = torusMaterial;
    torusMaterial.diffuseColor = new Color3(1, 0.5, 0.5);
    torusMaterial.refractionFresnelParameters = new FresnelParameters();
    torusMaterial.refractionFresnelParameters.bias = 0.5;
    torusMaterial.refractionFresnelParameters.power = 16;
    torusMaterial.refractionFresnelParameters.leftColor = Color3.Black();
    torusMaterial.refractionFresnelParameters.rightColor = Color3.White();
    torusMaterial.indexOfRefraction = 1.05;

    // click event on torus
    torus.actionManager = new ActionManager(scene);
    torus.actionManager.registerAction(
      new ExecuteCodeAction(
        ActionManager.OnPickUpTrigger,
        () => this.clickNumber++
      )
    );

    return torus;
  }

  private projectShadow(shadowGenerator: ShadowGenerator, mesh: Mesh): void {
    const shadowMap = shadowGenerator.getShadowMap();

    if (shadowMap !== null && shadowMap.renderList !== null) {
      shadowMap.renderList.push(mesh);
    }
  }
}
