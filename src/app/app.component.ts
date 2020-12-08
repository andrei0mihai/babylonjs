import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  NgZone,
  OnInit,
  ViewChild,
} from '@angular/core';
import { AngularFireStorage } from '@angular/fire/storage';
import {
  AbstractMesh,
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
  Mesh,
  MeshBuilder,
  ParticleSystem,
  PointerDragBehavior,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  Vector3,
} from '@babylonjs/core';
import { GrassProceduralTexture } from '@babylonjs/procedural-textures';
import { asyncScheduler, scheduled } from 'rxjs';
import { concatAll, toArray } from 'rxjs/operators';
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

  private particleSystem: ParticleSystem;

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
    Animation.ANIMATIONLOOPMODE_CYCLE
  );

  constructor(
    private angularFireStorage: AngularFireStorage,
    private readonly ngZone: NgZone,
    @Inject(DOCUMENT) readonly document: Document
  ) {
    this.canvasRef = {} as ElementRef<HTMLCanvasElement>;
    this.engine = new Engine(this.canvasRef.nativeElement);
    this.clickNumber = 0;
    this.particleSystem = {} as ParticleSystem;
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
      const fpsLabelElement = this.document.getElementById('fpsLabel');

      this.engine.runRenderLoop(() => {
        if (fpsLabelElement) {
          fpsLabelElement.innerHTML = this.engine.getFps().toFixed() + ' fps';
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

  onChangeFog(event: Event): void {
    if ((event.target as HTMLInputElement).checked) {
      this.scene.fogMode = Scene.FOGMODE_EXP;
      this.scene.fogColor = new Color3(0.9, 0.9, 0.9);
      this.scene.fogStart = 20;
      this.scene.fogEnd = 60;
      this.scene.fogDensity = 0.02;
    } else {
      this.scene.fogMode = Scene.FOGMODE_NONE;
    }
  }

  onChangeParticles(event: Event): void {
    if ((event.target as HTMLInputElement).checked) {
      this.particleSystem.start();
    } else {
      this.particleSystem.stop();
    }
  }

  private createCamera(
    scene: Scene,
    hTMLCanvasElement: HTMLCanvasElement
  ): void {
    const camera = new ArcRotateCamera(
      'camera',
      (3 * Math.PI) / 2,
      Math.PI / 8,
      100,
      Vector3.Zero(),
      scene
    );
    camera.setPosition(new Vector3(0, 5, -15));
    camera.attachControl(hTMLCanvasElement, true);
    camera.upperBetaLimit = Math.PI / 2;
    camera.lowerRadiusLimit = 10;
    camera.upperRadiusLimit = 50;
    camera.useBouncingBehavior = true;
    camera.useAutoRotationBehavior = true;
    camera.useFramingBehavior = true;
  }

  /**
   * An important thing to remember, is that for security reasons, web browsers don't allow local files to be accessed for web pages.
   * This includes any texture files you are using. You can use a local server or an image hosting service that is CORS enabled.
   * @param scene Local File Access
   */
  private createGround(scene: Scene): Mesh {
    const groundMesh = MeshBuilder.CreateGroundFromHeightMap(
      'groundMesh',
      'https://assets.babylonjs.com/environments/villageheightmap.png',
      {
        width: 128,
        height: 128,
        subdivisions: 64,
        minHeight: -512,
        maxHeight: 512,
      }
    );
    const groundMaterial = new StandardMaterial('ground', scene);
    const groundTexture = new GrassProceduralTexture(
      'woodProceduralTexture',
      1024,
      scene
    );

    groundMesh.cullingStrategy =
      AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;

    // disabling bounding info sync if no collisions must be calculated
    groundMesh.doNotSyncBoundingInfo = true;

    // Every mesh has a world matrix to specify its position / rotation / scaling. This matrix is evaluated on every frame.
    // You can improve performances by freezing this matrix. Any subsequent changes to position / rotation / scaling will then be ignore:
    groundMesh.freezeWorldMatrix();

    groundMesh.scaling = new Vector3(1, 0.01, 1);
    groundMesh.material = groundMaterial;
    groundMaterial.ambientTexture = groundTexture;
    // groundMesh.material.wireframe = true;
    groundMesh.position = new Vector3(0, -2, 0);
    return groundMesh;
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
    const particleSource = new AbstractMesh('particleSource', scene);

    // disabling bounding info sync if no collisions must be calculated
    particleSource.doNotSyncBoundingInfo = true;

    particleSource.freezeWorldMatrix();

    particleSource.cullingStrategy =
      AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;

    // Create a particle system
    this.particleSystem = new ParticleSystem('particles', 2000, scene);

    // Texture of each particle
    this.angularFireStorage
      .refFromURL(
        'https://firebasestorage.googleapis.com/v0/b/babylon-js-with-angular.appspot.com/o/particle.jpeg'
      )
      .getDownloadURL()
      .subscribe(
        (url) => (this.particleSystem.particleTexture = new Texture(url, scene))
      );

    // Where the particles come from
    particleSource.position = new Vector3(5, 0, 0);
    this.particleSystem.emitter = particleSource;
    // this.particleSystem.emitter = Vector3.Zero(); // the starting location

    // Colors of all particles
    this.particleSystem.color1 = new Color4(0.7, 0.8, 1.0, 1.0);
    this.particleSystem.color2 = new Color4(0.2, 0.5, 1.0, 1.0);
    this.particleSystem.colorDead = new Color4(0, 0, 0.2, 0.0);

    // Size of each particle (random between...
    this.particleSystem.minSize = 0.1;
    this.particleSystem.maxSize = 0.5;

    // Life time of each particle (random between...
    this.particleSystem.minLifeTime = 0.3;
    this.particleSystem.maxLifeTime = 1.5;

    // Emission rate
    this.particleSystem.emitRate = 1000;

    /******* Emission Space ********/
    this.particleSystem.createPointEmitter(
      new Vector3(-7, 8, 3),
      new Vector3(7, 8, -3)
    );

    // Speed
    this.particleSystem.minEmitPower = 1;
    this.particleSystem.maxEmitPower = 3;
    this.particleSystem.updateSpeed = 0.005;

    this.particleSystem.gravity = new Vector3(0, -19.81, 0);

    // Start the particle system
    this.particleSystem.start();
  }

  private createScene(canvasRef: ElementRef<HTMLCanvasElement>): void {
    const canvas = canvasRef.nativeElement;

    if (window.innerWidth < 415) {
      canvas.style.height = '100vh';
      canvas.style.width = '100%';
    }

    this.engine = new Engine(canvas, false, undefined, true);
    this.scene = new Scene(this.engine);

    // by setting blockfreeActiveMeshesAndRenderingGroups we tell the engine to insert all meshes without indexing and checking them
    this.scene.blockfreeActiveMeshesAndRenderingGroups = true;

    this.scene.blockMaterialDirtyMechanism = true;

    // camera
    this.createCamera(this.scene, canvas);
    const shadowGenerator = new ShadowGenerator(
      256,
      this.createLight(this.scene)
    );

    // background color
    this.scene.clearColor = new Color4(0.5, 0.5, 0.5, 1);

    // create ground and receive shadows
    this.createGround(this.scene).receiveShadows = true;

    this.projectShadow(shadowGenerator, this.createIcoSphere(this.scene));

    this.createParticleSystem(this.scene);

    this.createSkyBox(this.scene);

    this.projectShadow(shadowGenerator, this.createWall(this.scene));

    // we have to set it back to its original state
    this.scene.blockfreeActiveMeshesAndRenderingGroups = false;

    this.scene.blockMaterialDirtyMechanism = false;

    // Optimizer
    // SceneOptimizer.OptimizeAsync(this.scene);

    this.scene.autoClear = false; // Color buffer
    this.scene.autoClearDepthAndStencil = false; // Depth and stencil, obviously

    // replace this with animation from createCamera
    // this.scene.registerBeforeRender(
    //   () => (camera.alpha += 0.001 * this.scene.getAnimationRatio())
    // );
  }

  private createWall(scene: Scene): Mesh[] {
    const wallMesh = MeshBuilder.CreateBox(
      'wall',
      { size: 3, width: 8, depth: 1, height: 10 },
      scene
    );
    wallMesh.position = new Vector3(-2, 0, -5);

    const wallMaterial = new StandardMaterial('wallMaterial', scene);

    this.angularFireStorage
      .refFromURL(
        'https://firebasestorage.googleapis.com/v0/b/babylon-js-with-angular.appspot.com/o/rdbrick.jpg'
      )
      .getDownloadURL()
      .subscribe(
        (url) => (wallMaterial.diffuseTexture = new Texture(url, scene))
      );

    wallMesh.material = wallMaterial;

    const light = new DirectionalLight('light', new Vector3(-2, 3, 5), scene);
    light.intensity = 0.8;
    light.diffuse = Color3.White();
    light.position = new Vector3(2, 10, 5);

    return [wallMesh];
  }

  private createSkyBox(scene: Scene): void {
    const skybox = MeshBuilder.CreateBox('skyBox', { size: 100 }, scene);
    const skyboxMaterial = new StandardMaterial('skyBox', scene);
    const px$ = this.angularFireStorage
      .refFromURL(
        'https://firebasestorage.googleapis.com/v0/b/babylon-js-with-angular.appspot.com/o/skybox/skybox_px.jpg'
      )
      .getDownloadURL();
    const py$ = this.angularFireStorage
      .refFromURL(
        'https://firebasestorage.googleapis.com/v0/b/babylon-js-with-angular.appspot.com/o/skybox/skybox_py.jpg'
      )
      .getDownloadURL();
    const pz$ = this.angularFireStorage
      .refFromURL(
        'https://firebasestorage.googleapis.com/v0/b/babylon-js-with-angular.appspot.com/o/skybox/skybox_pz.jpg'
      )
      .getDownloadURL();
    const nx$ = this.angularFireStorage
      .refFromURL(
        'https://firebasestorage.googleapis.com/v0/b/babylon-js-with-angular.appspot.com/o/skybox/skybox_nx.jpg'
      )
      .getDownloadURL();
    const ny$ = this.angularFireStorage
      .refFromURL(
        'https://firebasestorage.googleapis.com/v0/b/babylon-js-with-angular.appspot.com/o/skybox/skybox_ny.jpg'
      )
      .getDownloadURL();
    const nz$ = this.angularFireStorage
      .refFromURL(
        'https://firebasestorage.googleapis.com/v0/b/babylon-js-with-angular.appspot.com/o/skybox/skybox_nz.jpg'
      )
      .getDownloadURL();

    skybox.convertToUnIndexedMesh();

    skybox.cullingStrategy = AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;

    skybox.freezeWorldMatrix();

    // disabling bounding info sync if no collisions must be calculated
    skybox.doNotSyncBoundingInfo = false;

    skyboxMaterial.backFaceCulling = false;
    scheduled([px$, py$, pz$, nx$, ny$, nz$], asyncScheduler)
      .pipe(concatAll(), toArray())
      .subscribe((files: string[]) => {
        skyboxMaterial.reflectionTexture = new CubeTexture(
          'https://firebasestorage.googleapis.com/v0/b/babylon-js-with-angular.appspot.com/o/skybox',
          scene,
          null,
          undefined,
          files
        );
        skyboxMaterial.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
      });
    skyboxMaterial.diffuseColor = new Color3(0, 0, 0);
    skyboxMaterial.specularColor = new Color3(0, 0, 0);
    skyboxMaterial.disableLighting = true;
    skybox.material = skyboxMaterial;
    skybox.material.needDepthPrePass = true;
  }

  private createIcoSphere(scene: Scene): Mesh[] {
    const keyFramesR = [];
    const material = new StandardMaterial('material', scene);
    const cloneMaterial = material.clone('cloneMaterial');
    const mesh = MeshBuilder.CreateIcoSphere('icoSphere', { radius: 1 }, scene);
    const clone = mesh.clone('icoSphere2');
    const pointerDragBehavior = new PointerDragBehavior({
      dragAxis: new Vector3(0, 1, 0),
    });

    mesh.convertToUnIndexedMesh();
    clone.convertToUnIndexedMesh();
    clone.freezeWorldMatrix();

    // mesh behaviour
    mesh.addBehavior(pointerDragBehavior);

    // disabling bounding info sync if no collisions must be calculated
    mesh.doNotSyncBoundingInfo = false;
    clone.doNotSyncBoundingInfo = false;

    mesh.cullingStrategy = AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
    clone.cullingStrategy = AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;

    clone.material = cloneMaterial;
    clone.material.needDepthPrePass = true;
    clone.position = new Vector3(3, 2, 0);
    mesh.position = new Vector3(0, 2, 0);

    this.angularFireStorage
      .refFromURL(
        'https://firebasestorage.googleapis.com/v0/b/babylon-js-with-angular.appspot.com/o/paper_rough_texture.jpg'
      )
      .getDownloadURL()
      .subscribe(
        (url) => (material.reflectionTexture = new CubeTexture(url, scene))
      );

    // red
    // material.diffuseColor = Color3.Red();
    // green
    // material.emissiveColor = Color3.Yellow();

    // how much it shines from the light source
    // material.specularPower = 10;

    material.reflectionFresnelParameters = new FresnelParameters();
    material.reflectionFresnelParameters.leftColor = Color3.Magenta();
    material.reflectionFresnelParameters.rightColor = Color3.Yellow();
    material.reflectionFresnelParameters.bias = 0.1;
    material.reflectionFresnelParameters.power = 2;

    // material.emissiveFresnelParameters = new FresnelParameters();
    // material.emissiveFresnelParameters.bias = 0.6;
    // material.emissiveFresnelParameters.power = 160;
    // material.emissiveFresnelParameters.leftColor = Color3.Teal();
    // material.emissiveFresnelParameters.rightColor = Color3.Purple();

    // removes shadow
    // material.opacityFresnelParameters = new FresnelParameters();
    // material.opacityFresnelParameters.leftColor = Color3.Blue();
    // material.opacityFresnelParameters.rightColor = Color3.Magenta();

    // material.refractionFresnelParameters = new FresnelParameters();
    // material.refractionFresnelParameters.leftColor = Color3.Blue();
    // material.refractionFresnelParameters.rightColor = Color3.Magenta();
    // material.indexOfRefraction = 1.05;

    // add material	to mesh
    mesh.material = material;

    // click event on mesh
    mesh.actionManager = new ActionManager(scene);
    mesh.actionManager.registerAction(
      new ExecuteCodeAction(
        ActionManager.OnPickUpTrigger,
        () => this.clickNumber++
      )
    );

    // no shadow if alpha !== 1
    cloneMaterial.alpha = 0.5;

    // add animations
    clone.animations = [];
    clone.animations.push(this.rotationAnim);
    clone.animations.push(this.wobbleAnim);
    keyFramesR.push({ frame: 0, value: 0 });
    keyFramesR.push({ frame: Constants.FPS, value: Math.PI });
    keyFramesR.push({ frame: 2 * Constants.FPS, value: 0 });
    this.rotationAnim.setKeys(keyFramesR);
    this.wobbleAnim.setKeys(keyFramesR);
    scene.beginDirectAnimation(
      clone,
      [this.rotationAnim, this.wobbleAnim],
      0,
      2 * Constants.FPS,
      true
    );

    return [mesh, clone];
  }

  private projectShadow(
    shadowGenerator: ShadowGenerator,
    meshes: Mesh[]
  ): void {
    const shadowMap = shadowGenerator.getShadowMap();

    if (shadowMap !== null && shadowMap.renderList !== null) {
      shadowMap.renderList.push(...meshes);
    }
  }
}
