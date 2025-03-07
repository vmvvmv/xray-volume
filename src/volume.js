/*
 * ShareVol
 * Lightweight WebGL volume viewer/slicer
 *
 * Copyright (c) 2014, Monash University. All rights reserved.
 * Author: Owen Kaluza - owen.kaluza ( at ) monash.edu
 *
 * Licensed under the GNU Lesser General Public License
 * https://www.gnu.org/licenses/lgpl.html
 *
 */
//BUGS:
//Canvas Y slightly too large, scroll bar appearing
//
//Improvements:
//Separate Opacity gradient
//Data min, data max - masked or clamped
//Timestepping
//Superimposed volumes

function Volume(props, image, interactive, parentEl) {
  
    interactive = true;
    this.image = image;
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "width: 100%; height: 100%; z-index: 0; margin: 0px; padding: 0px; background: black; border: none; display:block;";
    if (!parentEl) parentEl = document.body;
    parentEl.appendChild(this.canvas);
  
    //canvas event handling
    this.canvas.mouse = new Mouse(this.canvas, this);
    this.canvas.mouse.moveUpdate = true; //Continual update of deltaX/Y
  
    this.background = new Colour(0xff414952);
    this.borderColour = new Colour(0xffD9D5D0);
  
    this.width = this.height = 0; //Auto-size
  
    this.webgl = new WebGL(this.canvas);
    this.gl = this.webgl.gl;
  
    this.rotating = false;
    this.translate = [0,0,4];
    this.rotate = quat4.create();
    quat4.identity(this.rotate);
    this.focus = [0,0,0];
    this.centre = [0,0,0];
    this.modelsize = 1;
    this.scale = [1, 1, 1];
    this.orientation = 1.0; //1.0 for RH, -1.0 for LH
    this.fov = 45.0;
    this.focalLength = 1.0 / Math.tan(0.5 * this.fov * Math.PI/180);
    this.resolution = props.volume["res"];
  
    //Calculated scaling
    this.res = props.volume["res"];
    this.dims = props.volume["scale"];
    this.scaling = this.dims;
    //Auto compensate for differences in resolution..
    if (props.volume.autoscale) {
      //Divide all by the highest res
      // res size is global variavle for scaling different atlas sizes
      var maxn = Math.max.apply(null, this.res);
      this.scaling = [this.res[0] / maxn * this.dims[0], 
                      this.res[1] / maxn * this.dims[1],
                      this.res[2] / maxn * this.dims[2] / res_size];
    }
    this.tiles = [this.image.width / this.res[0],
                  this.image.height / this.res[1]];
    this.iscale = [1.0 / this.scaling[0], 1.0 / this.scaling[1], 1.0 / this.scaling[2]]
    //----------------------------------------
    var res  = props.volume.res;
    
    this.dimx = image.width / res[0];
    this.dimy = image.height / res[1];
  
    this.volumeRoiOffset = res[2] / this.dimx / this.dimy;
  
    //console.log(volumeRoiOffset);
  
    //Set dims
    this.centre = [0.5*this.scaling[0], 0.5*this.scaling[1], 0.5*this.scaling[2]];
    this.modelsize = Math.sqrt(3);
    this.focus = this.centre;
  
    this.translate[2] = -this.modelsize*1.25;
  
    OK.debug("New model size: " + this.modelsize + ", Focal point: " + this.focus[0] + "," + this.focus[1] + "," + this.focus[2]);
  
      //Setup 3D rendering
      this.linePositionBuffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.linePositionBuffer);
      var vertexPositions = [-1.0,  0.0,  0.0,
                              1.0,  0.0,  0.0,
                              0.0, -1.0,  0.0, 
                              0.0,  1.0,  0.0, 
                              0.0,  0.0, -1.0, 
                              0.0,  0.0,  1.0];
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertexPositions), this.gl.STATIC_DRAW);
      this.linePositionBuffer.itemSize = 3;
      this.linePositionBuffer.numItems = 6;
  
      this.lineColourBuffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.lineColourBuffer);
      var vertexColours =  [1.0, 0.0, 0.0, 1.0,
                            1.0, 0.0, 0.0, 1.0,
                            0.0, 1.0, 0.0, 1.0,
                            0.0, 1.0, 0.0, 1.0,
                            0.0, 0.0, 1.0, 1.0,
                            0.0, 0.0, 1.0, 1.0];
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertexColours), this.gl.STATIC_DRAW);
      this.lineColourBuffer.itemSize = 4;
      this.lineColourBuffer.numItems = 6;
  
    //Bounding box
    this.box([0.0, 0.0, 0.0], [1.0, 1.0, 1.0]);
    //Bounding boxes for intersections 
    this.interSectionBoxes = {  };
    this.currentIntersectBox = {
      minVertices : null,
      maxVertices: null,
      name: 'box1',
      color: [214, 188, 86],
      IntersectionBoxPositionBuffer : null,
      IntersectionBoxIndexBuffer : null
    };
  
    //console.log(this.res);
    if(props.intersections && props.intersections.length)
      for ( var i=0; i < props.intersections.length;i++ ) {
  
        this.interSectionBoxes[ props.intersections[i].name ] = {
  
          minVertices : [ props.intersections[i].minVertices[0] / this.res[0] / res_size ,props.intersections[i].minVertices[1] / this.res[1] / res_size, props.intersections[i].minVertices[2] / this.res[2] ],
          maxVertices:  [ props.intersections[i].maxVertices[0] / this.res[0] / res_size ,props.intersections[i].maxVertices[1]/ this.res[1] / res_size, props.intersections[i].maxVertices[2] / this.res[2] ],
          name:  props.intersections[i].name,
          color:  props.intersections[i].color,
          IntersectionBoxPositionBuffer : null,
          IntersectionBoxIndexBuffer : null
  
        }
  
        this.computeIntersectionBox(this.interSectionBoxes[ props.intersections[i].name ]);
  
      }
  
  
    this.showIntersection = false;
    // this.IntersectionBoxPositionBuffer = null;
    // this.IntersectionBoxIndexBuffer = null;
    //this.IntesectionColor = new Colour(0xff000000);
    //Setup two-triangle rendering
    this.webgl.init2dBuffers(this.gl.TEXTURE1); //Use 2nd texture unit
  
    //Override texture params set in previous call
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
  
    this.webgl.loadTexture(image, this.gl.LINEAR);
  
    //Compile the shaders
    var IE11 = !!window.MSInputMethodContext;  //More evil user-agent sniffing, broken WebGL on windows forces me to do this
    this.lineprogram = new WebGLProgram(this.gl, 'line-vs', 'line-fs');
    if (this.lineprogram.errors) OK.debug(this.lineprogram.errors);
    this.lineprogram.setup(["aVertexPosition", "aVertexColour"], ["uColour", "uAlpha"]);
      this.gl.vertexAttribPointer(this.lineprogram.attributes["aVertexPosition"], this.linePositionBuffer.itemSize, this.gl.FLOAT, false, 0, 0);
      this.gl.vertexAttribPointer(this.lineprogram.attributes["aVertexColour"], this.lineColourBuffer.itemSize, this.gl.FLOAT, false, 0, 0);
  
    var defines = "precision highp float; const highp vec2 slices = vec2(" + this.tiles[0] + "," + this.tiles[1] + ");\n";
    defines += (IE11 ? "#define IE11\n" : "#define NOT_IE11\n");
    var maxSamples = interactive ? 1024 : 256;
    defines += "const int maxSamples = " + maxSamples + ";\n\n\n\n\n\n"; //Extra newlines so errors in main shader have correct line #
    OK.debug(defines);
  
    var fs = getSourceFromElement('volume-fs');
    this.program = new WebGLProgram(this.gl, 'volume-vs', defines + fs);
     //console.log(defines + fs);
    if (this.program.errors) OK.debug(this.program.errors);
    this.program.setup(["aVertexPosition"], 
                       ["uBackCoord", "uVolume", "uTransferFunction", "uEnableColour", "uFilter",
                        "uDensityFactor", "uPower", "uSaturation", "uBrightness", "uContrast", "uSamples",
                        "uViewport", "uBBMin", "uBBMax", "uResolution", "uRange", "uDenMinMax",
                        "uIsoValue", "uIsoColour", "uIsoSmooth", "uIsoWalls", "uInvPMatrix"]);
  
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.clearColor(0, 0, 0, 0);
    //this.gl.clearColor(this.background.red/255, this.background.green/255, this.background.blue/255, 0.0);
      this.gl.enable(this.gl.BLEND);
      this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.depthFunc(this.gl.LEQUAL);
  
    //Set default properties
    this.properties = {};
  
    this.properties.samples = 256;
    this.properties.isovalue = 0.0;
    this.properties.isowalls = false;
    this.properties.isoalpha = 0.75;
    this.properties.isosmooth = 1.0;
    this.properties.colour = [214, 188, 86];
  
    this.properties.xmin = this.properties.ymin = this.properties.zmin = 0.0;
    this.properties.xmax = this.properties.ymax = this.properties.zmax = 1.0;
    this.drawCub = {};
    this.drawCub.xmin = this.drawCub.ymin = this.drawCub.zmin = 1;
    this.drawCub.xmax = this.res[0] * res_size;
    this.drawCub.ymax = this.res[1] * res_size;
    this.drawCub.zmax = this.res[2];
    this.properties.density = 10.0;
    this.properties.saturation = 1.0;
    this.properties.brightness = 0.0;
    this.properties.contrast = 1.0;
    this.properties.power = 1.0;
    this.properties.mindensity = props.volume.mindensity || 0.0;
    this.properties.maxdensity = props.volume.mindensity || 1.0;
    this.properties.usecolourmap = false;
    this.properties.tricubicFilter = false;
    this.properties.interactive = interactive;
    this.properties.axes = true;
    this.properties.border = true;
  
    //Load from local storage or previously loaded file
    this.load(props);
  }
  Volume.prototype.computeIntersectionBox = function( box ) {
    
      var min = box.minVertices;
      var max = box.maxVertices;
    
      var vertices = new Float32Array(
          [
            min[0], min[1], max[2] * this.volumeRoiOffset,
            min[0], max[1], max[2] * this.volumeRoiOffset,
            max[0], max[1], max[2] * this.volumeRoiOffset,
            max[0], min[1], max[2] * this.volumeRoiOffset,
            min[0], min[1], min[2] * this.volumeRoiOffset,
            min[0], max[1], min[2] * this.volumeRoiOffset,
            max[0], max[1], min[2] * this.volumeRoiOffset,
            max[0], min[1], min[2] * this.volumeRoiOffset
          ]);
    
      var indices = new Uint16Array(
          [
            0, 1, 1, 2, 2, 3, 3, 0,
            4, 5, 5, 6, 6, 7, 7, 4,
            0, 4, 3, 7, 1, 5, 2, 6
          ]
       );
      box.IntersectionBoxPositionBuffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, box.IntersectionBoxPositionBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
      box.IntersectionBoxPositionBuffer.itemSize = 3;
    
      box.IntersectionBoxIndexBuffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, box.IntersectionBoxIndexBuffer); 
      this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_DRAW);
      box.IntersectionBoxIndexBuffer.numItems = 24;
    
    }
  Volume.prototype.box = function(min, max) {
    var vertices = new Float32Array(
          [
            min[0], min[1], max[2],
            min[0], max[1], max[2],
            max[0], max[1], max[2],
            max[0], min[1], max[2],
            min[0], min[1], min[2],
            min[0], max[1], min[2],
            max[0], max[1], min[2],
            max[0], min[1], min[2]
          ]);
  
    var indices = new Uint16Array(
          [
            0, 1, 1, 2, 2, 3, 3, 0,
            4, 5, 5, 6, 6, 7, 7, 4,
            0, 4, 3, 7, 1, 5, 2, 6
          ]
       );
    this.boxPositionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.boxPositionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    this.boxPositionBuffer.itemSize = 3;
  
    this.boxIndexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.boxIndexBuffer); 
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_DRAW);
    this.boxIndexBuffer.numItems = 24;
  }
  
  Volume.prototype.clipminX = function(val) {this.properties.xmin = val / this.res[0];}
  Volume.prototype.clipmaxX = function(val) {this.properties.xmax = val / this.res[0];}
  Volume.prototype.clipminY = function(val) {this.properties.ymin = val / this.res[1];}
  Volume.prototype.clipmaxY = function(val) {this.properties.ymax = val / this.res[1];}
  Volume.prototype.clipminZ = function(val) {this.properties.zmin = val / this.res[2];}
  Volume.prototype.clipmaxZ = function(val) {this.properties.zmax = val / this.res[2];}
  
  Volume.prototype.addGUI = function(gui) {
    if (this.gui) this.gui.destroy(); //Necessary/valid?
  
    this.gui = gui;
  
    var f0 = this.gui.addFolder('Объём');
    f0.add(this.properties, 'interactive');
    f0.add(this.properties, 'usecolourmap');
    this.properties.samples = Math.floor(this.properties.samples);
    if (this.properties.samples % 32 > 0) this.properties.samples -= this.properties.samples % 32;
    f0.add(this.properties, 'samples', 32, 1024, 32).listen();
    f0.add(this.properties, 'density', 0.0, 50.0, 1.0).listen();
    f0.add(this.properties, 'brightness', -1.0, 1.0, 0.05).listen();
    f0.add(this.properties, 'contrast', 0.0, 2.0, 0.05).listen();
    f0.add(this.properties, 'saturation', 0.0, 2.0, 0.05).listen();
    f0.add(this.properties, 'power', 0.01, 5.0, 0.05).listen();
    f0.add(this.properties, 'mindensity', 0.0, 1.0, 0.0).listen();
    f0.add(this.properties, 'maxdensity', 0.0, 1.0, 1.0).listen();
    f0.add(this.properties, 'axes').listen();
    f0.add(this.properties, 'border').listen();
    f0.add(this.properties, 'tricubicFilter').listen();
  
    //Isosurfaces folder
    var f1 = this.gui.addFolder('3D поверхность');
    f1.add(this.properties, 'isovalue', 0.0, 1.0, 0.01).listen();
    f1.add(this.properties, 'isowalls').listen();
    f1.add(this.properties, 'isoalpha', 0.0, 1.0, 0.01).listen();
    f1.add(this.properties, 'isosmooth', 0.1, 3.0, 0.1).listen();
    f1.addColor(this.properties, 'colour').listen();
  
    //Clip planes folder
    var f2 = this.gui.addFolder('Область интереса (ROI)');
    
    var f3 = f2.addFolder('Показать');
    f3.add({"ROI" : function() { viewROI('ROI');}}, "ROI");
    f3.add({"Каллибровку" : function() { viewROI('m_bbox');}}, "Каллибровку");
  
    f2.add(this.drawCub, 'xmin', 1, this.res[0]).step(1).listen().onFinishChange(function(l) {
      that.properties.xmin = l / that.res[0];
      if (slicer) {
        slicer.clipminX(l);
        };
      that.delayedRender(250);
      }
      );
    f2.add(this.drawCub, 'xmax', 1, this.res[0]).step(1).listen().onFinishChange(function(l) {
      that.properties.xmax = l / that.res[0];
      if (slicer) {
        slicer.clipmaxX(l);
        };
      that.delayedRender(250);
      }
      );
    f2.add(this.drawCub, 'ymin', 1, this.res[1]).step(1).listen().onFinishChange(function(l) {
      that.properties.ymin = l / that.res[1];
      if (slicer) {
        slicer.clipminY(l);
        };
      that.delayedRender(250);
      }
      );
    f2.add(this.drawCub, 'ymax', 1, this.res[1]).step(1).listen().onFinishChange(function(l) {
      that.properties.ymax = l / that.res[1];
      if (slicer) {
        slicer.clipmaxY(l);
        };
      that.delayedRender(250);
      }
      );
    f2.add(this.drawCub, 'zmin', 1, this.res[2]).step(1).listen().onFinishChange(function(l) {
      that.properties.zmin = l / that.res[2] * that.volumeRoiOffset;
      if (slicer) {
        slicer.clipminZ(l);
        };
      that.delayedRender(250);
      }
      );
    f2.add(this.drawCub, 'zmax', 1, this.res[2]).step(1).listen().onFinishChange(function(l) {
      that.properties.zmax = l / that.res[2] * that.volumeRoiOffset;
      if (slicer) {
        slicer.clipmaxZ(l);
        };
      that.delayedRender(250);
      }
      );
  
    var changeROI = function(intersectionName) {
      if (intersectionName){
        that.interSectionBoxes[intersectionName].minVertices =  [that.drawCub.xmin/that.res[0], that.drawCub.ymin/that.res[1], that.drawCub.zmin/that.res[2]];
        that.interSectionBoxes[intersectionName].maxVertices =  [that.drawCub.xmax/that.res[0], that.drawCub.ymax/that.res[1], that.drawCub.zmax/that.res[2]];
        that.currentIntersectBox = that.interSectionBoxes[intersectionName];
        }
      that.computeIntersectionBox( that.currentIntersectBox );
      
      for (var i in f2.__controllers) {
        f2.__controllers[i].updateDisplay();
      }
      that.draw();
    };
    
    var viewROI = function(intersectionName) {
      if (intersectionName){
        that.properties.xmin = that.interSectionBoxes[intersectionName].minVertices[0];
        that.drawCub.xmin = that.properties.xmin * that.res[0]
        that.properties.ymin = that.interSectionBoxes[intersectionName].minVertices[1];
        that.drawCub.ymin = that.properties.ymin * that.res[1]
        if (that.drawCub.zmin != that.interSectionBoxes[intersectionName].maxVertices[2] * that.volumeRoiOffset * that.res[2]){
              that.properties.zmin = that.interSectionBoxes[intersectionName].minVertices[2] * that.volumeRoiOffset;
              that.drawCub.zmin = that.properties.zmin * that.res[2];
            }
        that.properties.xmax = that.interSectionBoxes[intersectionName].maxVertices[0];
        that.drawCub.xmax = that.properties.xmax * that.res[0]
        that.properties.ymax = that.interSectionBoxes[intersectionName].maxVertices[1];
        that.drawCub.ymax = that.properties.ymax * that.res[1]
        if (that.drawCub.zmax != that.interSectionBoxes[intersectionName].maxVertices[2] * that.volumeRoiOffset * that.res[2]){
              that.properties.zmax = that.interSectionBoxes[intersectionName].maxVertices[2] * that.volumeRoiOffset;
              that.drawCub.zmax = that.properties.zmax * that.res[2];
            }
        that.currentIntersectBox = that.interSectionBoxes[intersectionName];
        }
      that.computeIntersectionBox( that.currentIntersectBox );
  
      for (var i in f2.__controllers) {
        f2.__controllers[i].updateDisplay();
      }
      that.draw();
    };
  
    var f4 = f2.addFolder('Обновить');
    f4.add({"Обновить ROI" : function() { changeROI('ROI');}}, "Обновить ROI");
    f4.add({"Откаллибровать" : function() { changeROI('m_bbox');}}, "Откаллибровать");
    f4.add({"Сохранить" : function() {ajaxPost(APP_SETTINGS["update_url"], getData(true, true, 'roi'));}}, 'Сохранить');
    
  
    
    // Iterate over all controllers and set change function
    var that = this;
    var changefn = function(value) {that.delayedRender(250);};  //Use delayed high quality render for faster interaction
    for (var i in f0.__controllers)
      f0.__controllers[i].onChange(changefn);
    for (var i in f1.__controllers)
      f1.__controllers[i].onChange(changefn);
    for (var i in f2.__controllers)
      f2.__controllers[i].onChange(changefn);
    for (var i in f3.__controllers)
      f3.__controllers[i].onChange(changefn);
    for (var i in f4.__controllers)
      f4.__controllers[i].onChange(changefn);
  }
  
  
  Volume.prototype.renderXRAY = function() {
    this.properties.brightness = 0;
    this.properties.contrast = 1.1;
    this.properties.density = 25;
    this.properties.isovalue = 0;
    this.properties.maxdensity = 1;
    this.properties.mindensity = 0.35;
    this.properties.power = 5;
    this.properties.samples = 1024;
    this.properties.saturation = 0;
    }
  
  Volume.prototype.renderAnatomic = function() {
    this.properties.brightness = -0.11780890196982163;
    this.properties.contrast = 1;
    this.properties.density = 5;
    this.properties.isovalue = 0.45;
    this.properties.maxdensity = 1;
    this.properties.mindensity = 0;
    this.properties.power = 1;
    this.properties.samples = 256;
    this.properties.saturation = 1;
    }
  
  Volume.prototype.load = function(src) {
    for (var key in src)
      this.properties[key] = src[key]
  
    if (src.colourmap != undefined) this.properties.usecolourmap = true;
    this.properties.axes = state.views[0].axes;
    this.properties.border = state.views[0].border;
    this.properties.tricubicFilter = src.tricubicfilter;
  
    if (state.views[0].translate) this.translate = state.views[0].translate;
    //Initial rotation (Euler angles or quaternion accepted)
    if (state.views[0].rotate) {
      if (state.views[0].rotate.length == 3) {
        this.rotateZ(-state.views[0].rotate[2]);
        this.rotateY(-state.views[0].rotate[1]);
        this.rotateX(-state.views[0].rotate[0]);
      } else if (state.views[0].rotate[3] != 0)
        this.rotate = quat4.create(state.views[0].rotate);    
    }
  }
  
  Volume.prototype.get = function(matrix) {
    var data = {};
    if (matrix) {
      //Include the modelview matrix array
      data.modelview = this.webgl.modelView.toArray();
    } else {
      //Translate + rotation quaternion
      data.translate = this.translate;
      data.rotate = [this.rotate[0], this.rotate[1], this.rotate[2], this.rotate[3]];
    }
    data.properties = this.properties;
    return data;
  }
  
  var frames = 0;
  var testtime;
  
  Volume.prototype.draw = function(lowquality, testmode) {
    if (!this.properties || !this.webgl) return; //Getting called before vars defined, TODO:fix
    //this.time = new Date().getTime();
    if (this.width == 0 || this.height == 0) {
      //Get size from window
      this.width = window.innerWidth;
      this.height = window.innerHeight;
    }
  
    if (this.width != this.canvas.width || this.height != this.canvas.height) {
      //Get size from element
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.canvas.setAttribute("width", this.width);
      this.canvas.setAttribute("height", this.height);
      if (this.gl) {
        this.gl.viewportWidth = this.width;
        this.gl.viewportHeight = this.height;
        this.webgl.viewport = new Viewport(0, 0, this.width, this.height);
      }
    }
    //Reset to auto-size...
    //this.width = this.height = 0;
    //console.log(this.width + "," + this.height);
  
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    this.gl.viewport(this.webgl.viewport.x, this.webgl.viewport.y, this.webgl.viewport.width, this.webgl.viewport.height);
  
    //box/axes draw fully opaque behind volume
    if (this.properties.border) { 
      this.drawBox(1.0);
      this.showIntersection = false;
      this.drawIntersectionBoxes();
    }
    if (this.properties.axes) this.drawAxis(1.0);
    if (this.showIntersection === true ) { 
      //console.log('draw');
      this.drawCurrentIntersection(1.0, this.currentIntersectBox);
    }
    //Volume render (skip while interacting if lowpower device flag is set)
    if (!(lowquality && !this.properties.interactive)) {
      //Setup volume camera
      this.webgl.modelView.push();
      this.rayCamera();
    
      this.webgl.use(this.program);
      //this.webgl.modelView.scale(this.scaling);  //Apply scaling
        this.gl.disableVertexAttribArray(this.program.attributes["aVertexColour"]);
  
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.webgl.textures[0]);
  
      this.gl.activeTexture(this.gl.TEXTURE1);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.webgl.gradientTexture);
  
      //Only render full quality when not interacting
      //this.gl.uniform1i(this.program.uniforms["uSamples"], this.samples);
      this.gl.uniform1i(this.program.uniforms["uSamples"], lowquality ? this.properties.samples * 0.5 : this.properties.samples);
      this.gl.uniform1i(this.program.uniforms["uVolume"], 0);
      this.gl.uniform1i(this.program.uniforms["uTransferFunction"], 1);
      this.gl.uniform1i(this.program.uniforms["uEnableColour"], this.properties.usecolourmap);
      this.gl.uniform1i(this.program.uniforms["uFilter"], lowquality ? false : this.properties.tricubicFilter);
      this.gl.uniform4fv(this.program.uniforms["uViewport"], new Float32Array([0, 0, this.gl.viewportWidth, this.gl.viewportHeight]));
  
      var bbmin = [this.properties.xmin, this.properties.ymin, this.properties.zmin];
      var bbmax = [this.properties.xmax, this.properties.ymax, this.properties.zmax];
      this.gl.uniform3fv(this.program.uniforms["uBBMin"], new Float32Array(bbmin));
      this.gl.uniform3fv(this.program.uniforms["uBBMax"], new Float32Array(bbmax));
      this.gl.uniform3fv(this.program.uniforms["uResolution"], new Float32Array(this.resolution));
  
      this.gl.uniform1f(this.program.uniforms["uDensityFactor"], this.properties.density);
      // brightness and contrast
      this.gl.uniform1f(this.program.uniforms["uSaturation"], this.properties.saturation);
      this.gl.uniform1f(this.program.uniforms["uBrightness"], this.properties.brightness);
      this.gl.uniform1f(this.program.uniforms["uContrast"], this.properties.contrast);
      this.gl.uniform1f(this.program.uniforms["uPower"], this.properties.power);
  
      this.gl.uniform1f(this.program.uniforms["uIsoValue"], this.properties.isovalue);
      var colour = new Colour(this.properties.colour);
      colour.alpha = this.properties.isoalpha;
      this.gl.uniform4fv(this.program.uniforms["uIsoColour"], colour.rgbaGL());
      this.gl.uniform1f(this.program.uniforms["uIsoSmooth"], this.properties.isosmooth);
      this.gl.uniform1i(this.program.uniforms["uIsoWalls"], this.properties.isowalls);
  
      //Data value range (default only for now)
      this.gl.uniform2fv(this.program.uniforms["uRange"], new Float32Array([0.0, 1.0]));
      //Density clip range
      this.gl.uniform2fv(this.program.uniforms["uDenMinMax"], new Float32Array([this.properties.mindensity, this.properties.maxdensity]));
  
      //Draw two triangles
      this.webgl.initDraw2d(); //This sends the matrices, uNMatrix may not be correct here though
      this.gl.uniformMatrix4fv(this.program.uniforms["uInvPMatrix"], false, this.invPMatrix);
      //this.gl.enableVertexAttribArray(this.program.attributes["aVertexPosition"]);
      //this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.webgl.vertexPositionBuffer);
      //this.gl.vertexAttribPointer(this.program.attributes["aVertexPosition"], this.webgl.vertexPositionBuffer.itemSize, this.gl.FLOAT, false, 0, 0);
      //this.webgl.setMatrices();
  
      this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, this.webgl.vertexPositionBuffer.numItems);
  
      this.webgl.modelView.pop();
    } else {
      //Always draw axis even if turned off to show interaction
      if (!this.properties.axes) this.drawAxis(1.0);
      //Bounding box
      this.drawBox(1.0);
    }
  
    //this.timeAction("Render", this.time);
  
    //Draw box/axes again as overlay (near transparent)
    this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
    if (this.properties.axes) this.drawAxis(0.2);
    if (this.properties.border) this.drawBox(0.2);
  
    //Running speed test?
    if (testmode) {
      frames++;
      $('status').innerHTML = "Speed test: frame " + frames;
      if (frames == 5) {
        var elapsed = new Date().getTime() - testtime;
        console.log("5 frames in " + (elapsed / 1000) + " seconds");
        //Reduce quality for slower device
        if (elapsed > 1000) {
          this.properties.samples = Math.floor(this.properties.samples * 1000 / elapsed);
          if (this.properties.samples < 32) this.properties.samples = 32;
          $('status').innerHTML = "5 frames in " + (elapsed / 1000) + " seconds, Reduced quality to " + this.properties.samples;
          //Hide info window in 2 sec
          setTimeout(function() {info.hide()}, 2000);
        } else {
          info.hide();
        }
      } else {
        this.draw(true, true);
      }
    }
  }
  
  Volume.prototype.camera = function() {
    //Apply translation to origin, any rotation and scaling
    this.webgl.modelView.identity()
    this.webgl.modelView.translate(this.translate)
    // Adjust centre of rotation, default is same as focal point so this does nothing...
    adjust = [-(this.focus[0] - this.centre[0]), -(this.focus[1] - this.centre[1]), -(this.focus[2] - this.centre[2])];
    this.webgl.modelView.translate(adjust);
  
    // rotate model 
    var rotmat = quat4.toMat4(this.rotate);
    this.webgl.modelView.mult(rotmat);
    //this.webgl.modelView.mult(this.rotate);
  
    // Adjust back for rotation centre
    adjust = [this.focus[0] - this.centre[0], this.focus[1] - this.centre[1], this.focus[2] - this.centre[2]];
    this.webgl.modelView.translate(adjust);
  
    // Translate back by centre of model to align eye with model centre
    this.webgl.modelView.translate([-this.focus[0], -this.focus[1], -this.focus[2] * this.orientation]);
  
    //Perspective matrix
    this.webgl.setPerspective(this.fov, this.gl.viewportWidth / this.gl.viewportHeight, 0.1, 100.0);
  }
  
  Volume.prototype.rayCamera = function() {
    //Apply translation to origin, any rotation and scaling
    this.webgl.modelView.identity()
    this.webgl.modelView.translate(this.translate)
  
    // rotate model 
    var rotmat = quat4.toMat4(this.rotate);
    this.webgl.modelView.mult(rotmat);
  
    //For a volume cube other than [0,0,0] - [1,1,1], need to translate/scale here...
    this.webgl.modelView.translate([-this.scaling[0]*0.5, -this.scaling[1]*0.5, -this.scaling[2]*0.5]);  //Translate to origin
    //Inverse of scaling
    this.webgl.modelView.scale([this.iscale[0], this.iscale[1], this.iscale[2]]);
  
    //Perspective matrix
    this.webgl.setPerspective(this.fov, this.gl.viewportWidth / this.gl.viewportHeight, 0.1, 100.0);
  
    //Get inverted matrix for volume shader
    this.invPMatrix = mat4.create(this.webgl.perspective.matrix);
    mat4.inverse(this.invPMatrix);
  }
  
  Volume.prototype.drawAxis = function(alpha) {
    this.camera();
    this.webgl.use(this.lineprogram);
    this.gl.uniform1f(this.lineprogram.uniforms["uAlpha"], alpha);
    this.gl.uniform4fv(this.lineprogram.uniforms["uColour"], new Float32Array([1.0, 1.0, 1.0, 0.0]));
  
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.linePositionBuffer);
    this.gl.enableVertexAttribArray(this.lineprogram.attributes["aVertexPosition"]);
    this.gl.vertexAttribPointer(this.lineprogram.attributes["aVertexPosition"], this.linePositionBuffer.itemSize, this.gl.FLOAT, false, 0, 0);
  
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.lineColourBuffer);
    this.gl.enableVertexAttribArray(this.lineprogram.attributes["aVertexColour"]);
    this.gl.vertexAttribPointer(this.lineprogram.attributes["aVertexColour"], this.lineColourBuffer.itemSize, this.gl.FLOAT, false, 0, 0);
  
    //Axis position, default centre, use slicer positions if available
    var pos = [0.5*this.scaling[0], 0.5*this.scaling[1], 0.5*this.scaling[2]];
    if (this.slicer) {
      pos = [this.slicer.slices[0]*this.scaling[0] / res_size, 
             this.slicer.slices[1]*this.scaling[1] / res_size,
             this.slicer.slices[2]*this.scaling[2] * this.volumeRoiOffset];
    }
    this.webgl.modelView.translate(pos);
    this.webgl.setMatrices();
    this.gl.drawArrays(this.gl.LINES, 0, this.linePositionBuffer.numItems);
    this.webgl.modelView.translate([-pos[0], -pos[1], -pos[2]]);
  }
  
  Volume.prototype.drawBox = function(alpha) {
    this.camera();
    this.webgl.use(this.lineprogram);
    this.gl.uniform1f(this.lineprogram.uniforms["uAlpha"], alpha);
    this.gl.uniform4fv(this.lineprogram.uniforms["uColour"], this.borderColour.rgbaGL());
  
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.boxPositionBuffer);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.boxIndexBuffer);
    this.gl.enableVertexAttribArray(this.lineprogram.attributes["aVertexPosition"]);
    this.gl.vertexAttribPointer(this.lineprogram.attributes["aVertexPosition"], this.boxPositionBuffer.itemSize, this.gl.FLOAT, false, 0, 0);
      this.gl.vertexAttribPointer(this.lineprogram.attributes["aVertexColour"], 4, this.gl.UNSIGNED_BYTE, true, 0, 0);
  
    this.webgl.modelView.scale(this.scaling);  //Apply scaling
    this.webgl.setMatrices();
    this.gl.drawElements(this.gl.LINES, this.boxIndexBuffer.numItems, this.gl.UNSIGNED_SHORT, 0);
  }
  Volume.prototype.drawCurrentIntersection = function( alpha, box ) {
    this.camera();
    this.webgl.use(this.lineprogram);
    this.gl.uniform1f(this.lineprogram.uniforms["uAlpha"], alpha);
    
    // precomputed to each box
    //var randomColor = new Colour('#'+Math.floor(Math.random()*16777215).toString(16));
    var color = new Colour(box.color);
    this.gl.uniform4fv(this.lineprogram.uniforms["uColour"], color.rgbaGL());
  
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, box.IntersectionBoxPositionBuffer);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, box.IntersectionBoxIndexBuffer);
    this.gl.enableVertexAttribArray(this.lineprogram.attributes["aVertexPosition"]);
    this.gl.vertexAttribPointer(this.lineprogram.attributes["aVertexPosition"], box.IntersectionBoxPositionBuffer.itemSize, this.gl.FLOAT, false, 0, 0);
    this.gl.vertexAttribPointer(this.lineprogram.attributes["aVertexColour"], 4, this.gl.UNSIGNED_BYTE, true, 0, 0);
  
    this.webgl.modelView.scale(this.scaling);  //Apply scaling
    this.webgl.setMatrices();
    this.gl.drawElements(this.gl.LINES, box.IntersectionBoxIndexBuffer.numItems, this.gl.UNSIGNED_SHORT, 0);
  }
  
  Volume.prototype.drawIntersectionBoxes = function () {
  
    for ( boxname of Object.keys(this.interSectionBoxes) ) {
  
      this.drawCurrentIntersection( 1.0, this.interSectionBoxes[boxname] );
  
    }
  
  }
  
  Volume.prototype.timeAction = function(action, start) {
    if (!window.requestAnimationFrame) return;
    var timer = start || new Date().getTime();
    function logTime() {
      var elapsed = new Date().getTime() - timer;
      if (elapsed < 50) 
        window.requestAnimationFrame(logTime); //Not enough time, assume triggered too early, try again
      else {
        console.log(action + " took: " + (elapsed / 1000) + " seconds");
        /*if (elapsed > 200 && this.quality > 32) {
          this.quality = Math.floor(this.quality * 0.5);
          OK.debug("Reducing quality to " + this.quality + " samples");
          this.draw();
        } else if (elapsed < 100 && this.quality < 512 && this.quality >= 128) {
          this.quality = this.quality * 2;
          OK.debug("Increasing quality to " + this.quality + " samples");
          this.draw();
        }*/
      }
    }
    window.requestAnimationFrame(logTime);
  }
  
  Volume.prototype.rotateX = function(deg) {
    this.rotation(deg, [1,0,0]);
  }
  
  Volume.prototype.rotateY = function(deg) {
    this.rotation(deg, [0,1,0]);
  }
  
  Volume.prototype.rotateZ = function(deg) {
    this.rotation(deg, [0,0,1]);
  }
  
  Volume.prototype.rotation = function(deg, axis) {
    //Quaterion rotate
    var arad = deg * Math.PI / 180.0;
    var rotation = quat4.fromAngleAxis(arad, axis);
    rotation = quat4.normalize(rotation);
    this.rotate = quat4.multiply(rotation, this.rotate);
  }
  
  Volume.prototype.zoom = function(factor) {
    this.translate[2] += factor * this.modelsize;
  }
  
  Volume.prototype.zoomClip = function(factor) {
    //var clip = parseFloat($("nearclip").value) - factor;
    //$("nearclip").value = clip;
    this.draw();
    //OK.debug(clip + " " + $("nearclip").value);
  }
  
  Volume.prototype.click = function(event, mouse) {
    this.rotating = false;
    this.draw();
    return false;
  }
  
  Volume.prototype.move = function(event, mouse) {
    this.rotating = false;
    if (!mouse.isdown) return true;
  
    //Switch buttons for translate/rotate
    var button = mouse.button;
  
    switch (button)
    {
      case 0:
        this.rotateY(mouse.deltaX/5.0);
        this.rotateX(mouse.deltaY/5.0);
        this.rotating = true;
        break;
      case 1:
        this.rotateZ(Math.sqrt(mouse.deltaX*mouse.deltaX + mouse.deltaY*mouse.deltaY)/5.0);
        this.rotating = true;
        break;
      case 2:
        var adjust = this.modelsize / 1000;   //1/1000th of size
        this.translate[0] += mouse.deltaX * adjust;
        this.translate[1] -= mouse.deltaY * adjust;
        break;
    }
  
    this.draw(true);
    return false;
  }
  
  Volume.prototype.wheel = function(event, mouse) {
    if (event.shiftKey) {
      var factor = event.spin * 0.01;
      this.zoomClip(factor);
    } else {
      var factor = event.spin * 0.05;
      this.zoom(factor);
    }
    this.delayedRender(250); //Delayed high quality render
  
    return false; //Prevent default
  }
  
  Volume.prototype.pinch = function(event, mouse) {
  
    var zoom = (event.distance * 0.0001);
    console.log(' --> ' + zoom);
    this.zoom(zoom);
    this.delayedRender(250); //Delayed high quality render
  }
  
  //Delayed high quality render
  Volume.prototype.delayedRender = function(time, skipImm) {
    if (!skipImm) this.draw(true); //Draw immediately in low quality
    //Set timer to draw the final render
    if (this.delaytimer) clearTimeout(this.delaytimer);
    var that = this;
    this.delaytimer = setTimeout(function() {that.draw();}, time);
  }
  
  Volume.prototype.applyBackground = function(bg) {
    if (!bg) return;
    this.background = new Colour(bg);
    var hsv = this.background.HSV();
    this.borderColour = hsv.V > 50 ? new Colour(0xff414952) : new Colour(0xffbbbbbb);
  
    //document.body.style.background = bg;
  
      //Set canvas background
      if (this.properties.usecolourmap)
        this.canvas.style.backgroundColor = bg;
      else
        this.canvas.style.backgroundColor = "black";
  
  
  }
  