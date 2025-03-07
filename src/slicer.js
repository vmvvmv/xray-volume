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

function Slicer(props, image, filter, parentEl) {
  //console.log(props.slices.properties.importAtlasUrl);
  
  this.image = image;
  this.res = props.volume.res;
  this.dims = [props.volume.res[0] * props.volume.scale[0], 
               props.volume.res[1] * props.volume.scale[1], 
               props.volume.res[2] * props.volume.scale[2]];
  this.slices = [0.5, 0.5, 0.5];

  // Set properties
  this.properties = {};
  this.properties.show = true;
  this.properties.X = Math.round(this.res[0] / 2);
  this.properties.Y = Math.round(this.res[1] / 2);
  this.properties.Z = Math.round(this.res[2] / 2);

  this.properties.minX = 0;
  this.properties.maxX = Math.round(this.res[0]);
  this.properties.minY = 0;
  this.properties.maxY = Math.round(this.res[1]);
  this.properties.minZ = 0;
  this.properties.maxZ = Math.round(this.res[2]);

  this.properties.brightness = 0.0;
  this.properties.contrast = 1.0;
  this.properties.power = 1.0;
  this.properties.usecolourmap = false;
  this.properties.layout = "YzX";
  this.flipY = false;
  this.properties.zoom = 1.0;

  //brush---------------------------------------------------
  this.properties.enableBrush = true;
  this.properties.drawRectangles = true;
  this.properties.showBrush = true;
  this.properties.brushTransperency = 255;
  this.properties.brushColour =  [214, 188, 86];

  this.currentBrush = {

    label:'orange',
    color: [214, 188, 86],
    lineCoords:[],

  }
  this.labels = {};
  this.labels[this.currentBrush.label] = this.currentBrush;

  this.properties.importAtlasUrl = props.slices.properties.importAtlasUrl||undefined;

  //-----------------------------------------------------------------------------------
  this.container = document.createElement("div");
  this.container.style.cssText = "position: absolute; bottom: 10px; left: 10px; margin: 0px; padding: 0px; pointer-events: none;";
  if (!parentEl) parentEl = document.body;
  parentEl.appendChild(this.container);

  //Load from local storage or previously loaded file
  if (props.slices) this.load(props.slices);

  this.canvas = document.createElement("canvas");
  this.canvas.style.cssText = "position: absolute; bottom: 0px;   z-index: 0; margin: 0px; padding: 0px; border: none; background: rgba(0,0,0,0); pointer-events: none;";
  this.canvas.mouse = new Mouse(this.canvas, this);

  this.webgl = new WebGL(this.canvas);
  this.gl = this.webgl.gl;

  this.filter = this.gl.NEAREST; //Nearest-neighbour (default)
  if (filter == "linear") this.filter = this.gl.LINEAR;

  //Use the default buffers
  this.webgl.init2dBuffers(this.gl.TEXTURE2);

  //Compile the shaders
  this.program = new WebGLProgram(this.gl, 'texture-vs', 'texture-fs');
  if (this.program.errors) OK.debug(this.program.errors);
  this.program.setup(["aVertexPosition"], ["palette", "texture", "colourmap", "cont", "bright", "power", "slice", "dim", "res", "axis", "select"]);


  this.gl.clearColor(0, 0, 0, 0);
  this.gl.enable(this.gl.BLEND);
  this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
  this.gl.enable(this.gl.SCISSOR_TEST);

  //Load the textures
  this.loadImage(this.image);
  //--------Draw brush with shader---------------------------------

  this.brushCanvas = document.createElement("canvas");
  this.brushCanvas.style.cssText = "position: absolute; bottom: 0px;   z-index: 0; margin: 0px; padding: 0px; border: none; background: rgba(0,0,0,0); pointer-events: none;";
  
  this.brushGradient = document.createElement("canvas");
  this.brushGradient.width = 2048;
  this.brushGradient.height = 1;
  this.brushColourMap = [];

  this.colours = new GradientEditor($('palette'), this.updateBrushColourMap);
  
  this.isImportTextureLoaded = false;
  this.currentItem = { label:''};
  //-----------------------------------------------------

  this.overlayCanvas = document.createElement("canvas");
  this.overlayCanvas.style.cssText = 'position: absolute; bottom: 0px;   z-index: 1; margin: 0px; padding: 0px; border: none; background: rgba(0,0,0,0); pointer-events: none;';
  this.overlayCanvasContext =  this.overlayCanvas.getContext('2d');

  this.container.appendChild(this.overlayCanvas);

  this.doLayout();

  //------------------------------------------------
  //Hidden?
  if (!this.properties.show) this.toggle();

  //console.log(this);
  //exportBrush canvas
  this.exportCanvas = document.createElement("canvas");
  this.exportCanvas.width = this.image.width;
  this.exportCanvas.height = this.image.height;
}

function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
  } : null;
}

Slicer.prototype.toggle = function() {
  if (this.container.style.visibility == 'hidden')
    this.container.style.visibility = 'visible';
  else
    this.container.style.visibility = 'hidden';
}

//          ##   ##            
//           ## ##             
// ####### ######### #######   
//           ## ##             
//          ##   ##            
                            
//  ######   ##     ## ####    
// ##    ##  ##     ##  ##     
// ##        ##     ##  ##     
// ##   #### ##     ##  ##     
// ##    ##  ##     ##  ##     
// ##    ##  ##     ##  ##     
//  ######    #######  ####    

Slicer.prototype.addGUI = function(gui) {
  this.gui = gui;
  var that = this;
  //Add folder
  var f1 = this.gui.addFolder('Слои');
  f1.add(this.properties, 'show').onFinishChange(function(l) {that.toggle();});
  //["hide/show"] = function() {};
  f1.add(this.properties, 'zoom', 0.01, 4.0, 0.1).listen().onFinishChange(function(l) {that.doLayout(); that.draw();});
  f1.add(this.properties, 'brightness', -1.0, 1.0, 0.01).listen();
  f1.add(this.properties, 'contrast', 0.0, 3.0, 0.01).listen();
  f1.add(this.properties, 'power', 0.01, 5.0, 0.01).listen();
  f1.add(this.properties, 'usecolourmap');
  f1.add(this.properties, 'drawRectangles').onChange( function(){ that.draw });
  f1.add(this.properties, 'layout').onFinishChange(function(l) {that.doLayout(); that.draw();});

  f1.add(this.properties, 'X', 0, this.res[0] * res_size, 1).listen();
  f1.add(this.properties, 'Y', 0, this.res[1] * res_size, 1).listen();
  f1.add(this.properties, 'Z', 0, this.res[2], 1).listen();

  var changefn = function(value) {that.draw();};
  for (var i in f1.__controllers)
    f1.__controllers[i].onChange(changefn);

  //--------------Brush

  var f3 = this.gui.addFolder('Сегментации');
  var f4 = f3.addFolder('Загрузка');
  
  f3.add( {"import brush atlas": function(){ 
    
     that.importBrush(); 
    
  }}, 'import brush atlas'); 

  // if (APP_SETTINGS) {

  //   var object = {};
    
  //   for (let key of Object.keys(APP_SETTINGS.segmentations)) {
      
  //     object[key] = function() {

  //               that.properties.importAtlasUrl = APP_SETTINGS.segmentations[key];
  //               that.importBrush();
  //             }
  //     f4.add( object, key);
  //     }    
  //   }
    
  var f5 = f3.addFolder('Редактирование');
  var newName = { name: 'new label', color: [214, 188, 86] };
  var currentItem = { label: null };

  f5.add(newName, 'name').onChange( function(){

    that.currentBrush.name = newName.name;

  });


  f5.add( {"new label": function() {
    
    that.currentBrush = {
      
          label: newName.name,
          color: newName.color,
          lineCoords:[],
      
    }
    
  }}, 'new label');

  f5.add( {"save label": function() {
    
    that.labels[that.currentBrush.label] = that.currentBrush;

    f5.__controllers[f5.__controllers.length-1].remove();

    f5.add( currentItem, 'label', Object.keys(that.labels) ).onChange(function(val) {
      
      that.currentBrush = that.labels[ val ];

      //console.log(that.labels);
      that.draw();

      for (var i in f5.__controllers) {
        f5.__controllers[i].updateDisplay();
      }
      
    });

  }}, 'save label');
  
  f5.add( {"export brush atlas": function(){
        
      that.exportBrush();
        
  }}, 'export brush atlas');


  f3.add(this.properties, 'enableBrush').onChange( function(){
    that.draw();
  });
  f3.add(this.properties, 'showBrush').onChange( function(){
    that.draw();
  });

  f3.add(this.properties, 'brushTransperency', 0, 255, 1).listen().onChange(function() {
    
        that.draw();
    
  });

  f3.addColor(this.properties, 'brushColour').onChange(function(){

    that.currentBrush.color = that.properties.brushColour;

    var colour = slicer.brushColourMap[that.currentBrush.label];

    var color;
    
    if ( that.properties.brushColour instanceof Array) {

      color =   rgbToHex( Math.floor( that.properties.brushColour[0]),
                              Math.floor( that.properties.brushColour[1]),
                              Math.floor( that.properties.brushColour[2]));
    } else {

      color =   that.properties.brushColour;

    }

    var rgb = hexToRgb(color);

    //console.log(that.properties.brushColour);

    if ( colour !== undefined ) {

      colour.colour = "rgba("+rgb.r+","+rgb.g+","+rgb.b+",1.00)";

      slicer.colours.read(slicer.brushColourMap);

      //console.log(slicer.brushColourMap);
      
      slicer.colours.update();

    }


    that.draw();

  });

  f3.add( currentItem, 'label', Object.keys(this.labels) ).onChange(function(val) {
        
        that.currentBrush = that.labels[ val ];
        that.draw();
        for (var i in f3.__controllers) {
          f3.__controllers[i].updateDisplay();
        }
        
  });


    f3.open();

}

Slicer.prototype.get = function() {
  var data = {};
  //data.colourmap = colours.palette.toString();
  data.properties = this.properties;

  data.savedLabels = {};

  for( key of Object.keys( this.labels ) ) {

    var label = this.labels[key];

    data.savedLabels[key] = {

        label:label.label,
        color: label.color

    }

  }
  
  return data;
}

Slicer.prototype.load = function(src) {
  //colours.read(data.colourmap);
  //colours.update();
  for (var key in src.properties)
    this.properties[key] = src.properties[key]
}

Slicer.prototype.setX = function(val) {this.properties.X = val * this.res[0]; this.draw();}
Slicer.prototype.setY = function(val) {this.properties.Y = val * this.res[1]; this.draw();}
Slicer.prototype.setZ = function(val) {this.properties.Z = val * this.res[2]; this.draw();}

Slicer.prototype.clipminX = function(val) {this.properties.minX = val * this.res[0]; this.draw();}
Slicer.prototype.clipmaxX = function(val) {this.properties.maxX = val * this.res[0]; this.draw();}
Slicer.prototype.clipminY = function(val) {this.properties.minY = val * this.res[1]; this.draw();}
Slicer.prototype.clipmaxY = function(val) {this.properties.maxY = val * this.res[1]; this.draw();}
Slicer.prototype.clipminZ = function(val) {this.properties.minZ = val * this.res[2]; this.draw();}
Slicer.prototype.clipmaxZ = function(val) {this.properties.maxZ = val * this.res[2]; this.draw();}

Slicer.prototype.doLayout = function() {
  this.viewers = [];

  var x = 0;
  var y = 0;
  var xmax = 0;
  var ymax = 0;
  var rotate = 0;
  var alignTop = true;

  removeChildren(this.container);

  var that = this;
  var buffer = "";
  var rowHeight = 0, rowWidth = 0;
  var addViewer = function(idx) {
    //console.log( that.viewers);
    var mag = 1.0;
    if (buffer) mag = parseFloat(buffer);
    var v = new SliceView(that, x, y, idx, rotate, mag);
    that.viewers.push(v);
    that.container.appendChild(v.div);

    y += v.viewport.height + 5; //Offset by previous height
    var w = v.viewport.width + 5;
    if (w > rowWidth) rowWidth = w;
    if (y > ymax) ymax = y;
  }
  

  //Process based on layout
  this.flipY = false;
  for (var i=0; i<this.properties.layout.length; i++) {
    var c = this.properties.layout.charAt(i);
    //console.log(c);
    rotate = 0;
    switch (c) {
      case 'X':
        rotate = -90;
      case 'x':
        addViewer(0);
        break;
      case 'Y':
        rotate = 180;
      case 'y':
        addViewer(1);
        break;
      case 'Z':
        //rotate = 360;
      case 'z':
        addViewer(2);
        break;
      case '|':
        y = 0;
        x += rowWidth;
        rowWidth = 0;
        break;
      case '_':
        this.flipY = true;
        break;
      case '-':
        alignTop = false;
        break;
      default:
        //Add other chars to buffer, if a number will be used as zoom
        buffer += c;
        continue;
    }
    //Clear buffer
    buffer = "";
  }

  this.width = x + rowWidth;
  this.height = ymax;

 // console.log(this.width, this.height);
  // that.viewers[2].viewport.y = that.viewers[0].viewport.y;
  // that.viewers[0].viewport.y = 0;

  //Restore the main canvas
  this.container.appendChild(this.canvas);
  this.container.appendChild(this.brushCanvas);
  this.container.appendChild(this.overlayCanvas);

  if (alignTop) {
    this.container.style.bottom = "";
    this.container.style.top = (this.height + 10) + "px";
  } else {
    this.container.style.top = undefined;
    this.container.style.bottom = 10 + "px";
  }
}

Slicer.prototype.loadImage = function(image, isForBrush) {
  //Texture load
  if(isForBrush)
  for (var i=0; i<3; i++)
    this.brushWebgl.loadTexture(image, this.filter);
  else
  for (var i=0; i<3; i++)
    this.webgl.loadTexture(image, this.filter);

  this.reset();
}

Slicer.prototype.reset = function() {
  this.dimx = this.image.width / this.res[0];
  this.dimy = this.image.height / this.res[1];
  //console.log(this.res[0] + "," + this.res[1] + "," + this.res[2] + " -- " + this.dimx + "x" + this.dimy);
}

Slicer.prototype.updateColourmap = function() {
  this.webgl.updateTexture(this.webgl.gradientTexture, $('gradient'), this.gl.TEXTURE2);  //Use 2nd texture unit
  // if(this.brushWebgl)
  // this.brushWebgl.updateTexture(this.brushWebgl.gradientTexture, $('gradient'), this.brushGl.TEXTURE2);  //Use 2nd texture unit

  this.draw();
}

Slicer.prototype.draw = function() {
  this.slices = [(this.properties.X-1)/(this.res[0]-1), 
                 (this.properties.Y-1)/(this.res[1]-1),
                 (this.properties.Z-1)/(this.res[2]-1)];

  if (this.width != this.canvas.width || this.height != this.canvas.height) {
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.setAttribute("width", this.width);
    this.canvas.setAttribute("height", this.height);

    this.overlayCanvas.width = this.width;
    this.overlayCanvas.height = this.height;
    this.overlayCanvas.setAttribute("width", this.width);
    this.overlayCanvas.setAttribute("height", this.height);

    this.brushCanvas.width = this.width;
    this.brushCanvas.height = this.height;
    this.brushCanvas.setAttribute("width", this.width);
    this.brushCanvas.setAttribute("height", this.height)
    if (this.webgl) {
      this.gl.viewportWidth = this.width;
      this.gl.viewportHeight = this.height;
      this.webgl.viewport = new Viewport(0, 0, this.width, this.height);
    }
    if (this.brushWebgl) {
      this.brushGl.viewportWidth = this.width;
      this.brushGl.viewportHeight = this.height;
      this.brushWebgl.viewport = new Viewport(0, 0, this.width, this.height);
    }

  }

  this.webgl.use(this.program);

  //Uniform variables

  //Gradient texture
  this.gl.activeTexture(this.gl.TEXTURE0);
  this.gl.bindTexture(this.gl.TEXTURE_2D, this.webgl.gradientTexture);
  this.gl.uniform1i(this.program.uniforms["palette"], 0);

  //Options
  this.gl.uniform1i(this.program.uniforms["colourmap"], this.properties.usecolourmap);

  // brightness and contrast
  this.gl.uniform1f(this.program.uniforms["bright"], this.properties.brightness);
  this.gl.uniform1f(this.program.uniforms["cont"], this.properties.contrast);
  this.gl.uniform1f(this.program.uniforms["power"], this.properties.power);

  //Image texture
  this.gl.activeTexture(this.gl.TEXTURE1);
  this.gl.bindTexture(this.gl.TEXTURE_2D, this.webgl.textures[0]);
  this.gl.uniform1i(this.program.uniforms["texture"], 1);

  //Clear all
  this.gl.scissor(0, 0, this.width, this.height);
  this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

  //-------------------------------------------------------------------

  if( this.isImportTextureLoaded ) { 
    this.brushWebgl.use(this.brushProgram);
    
    //Uniform variables

    //Gradient texture
    this.brushGl.activeTexture(this.brushGl.TEXTURE0);
    //console.log(this.webgl.gradientTexture);
    //console.log(this.brushWebgl.gradientTexture);
    this.brushGl.bindTexture(this.brushGl.TEXTURE_2D, this.brushWebgl.gradientTexture);
    this.brushGl.uniform1i(this.brushProgram.uniforms["palette"], 0);

    //Options

    this.brushGl.uniform1i(this.brushProgram.uniforms["colourmap"], true);

    // brightness and contrast
    this.brushGl.uniform1f(this.brushProgram.uniforms["bright"], this.properties.brightness);
    this.brushGl.uniform1f(this.brushProgram.uniforms["cont"], this.properties.contrast);
    this.brushGl.uniform1f(this.brushProgram.uniforms["power"], this.properties.power);

    //Image texture
    this.brushGl.activeTexture(this.brushGl.TEXTURE1);
    this.brushGl.bindTexture(this.brushGl.TEXTURE_2D, this.brushWebgl.textures[0]);
    this.brushGl.uniform1i(this.brushProgram.uniforms["texture"], 1);

    //Clear all
    this.brushGl.scissor(0, 0, this.width, this.height);
    //console.log(this.brushGl.COLOR_BUFFER_BIT | this.brushGl.DEPTH_BUFFER_BIT);
    //this.brushGl.clearColor(0.5, 0, 0, 0.5);
    this.brushGl.clear(this.brushGl.COLOR_BUFFER_BIT | this.brushGl.DEPTH_BUFFER_BIT);
  }
  //-------------------------------------------------------
  //Draw each slice viewport
  for (var i=0; i<this.viewers.length; i++) {

    this.drawSlice(i);
    if( this.isImportTextureLoaded )
    this.drawBrushShader(i);

  }

    this.overlayCanvasContext.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);  
  
    if(this.properties.drawRectangles)
    this.drawIntersections();

    //console.log(this.properties.drawRectangles);
    if(this.properties.enableBrush || this.properties.showBrush)
    this.drawBrush();
    
}

Slicer.prototype.drawSlice = function(idx) {
  var view = this.viewers[idx];
  var vp = view.viewport;

  //Set selection crosshairs
  var sel;
  if (view.rotate == -90) {
      sel = [this.slices[view.j] / res_size, 1.0 - this.slices[view.i]];
  }
  else if (view.rotate == 180) {
      sel = [1 - this.slices[view.i] / res_size, 1 - this.slices[view.j]];
  }
  else if (view.rotate == 360) {
      sel = [1 - this.slices[view.i], this.slices[view.j]];
  }
  else {
      if( view.axis===2 )
        sel = [this.slices[view.i] / res_size, this.slices[view.j] / res_size];
      else if( view.axis===1 )
        sel = [this.slices[view.i] / res_size, this.slices[view.j]];
      else if( view.axis===0 )
        sel = [this.slices[view.i], this.slices[view.j] / res_size];
  }
  
  //Swap y-coord
  if (!this.flipY) sel[1] = 1.0 - sel[1];

  this.webgl.viewport = vp;
  this.gl.scissor(vp.x, vp.y, vp.width, vp.height);
  //console.log(JSON.stringify(vp));

  //Apply translation to origin, any rotation and scaling (inverse of zoom factor)
  this.webgl.modelView.identity()
  this.webgl.modelView.translate([0.5, 0.5, 0])
  this.webgl.modelView.rotate(-view.rotate, [0, 0, 1]);

  //Apply zoom and flip Y
  var scale = [1.0/2.0, -1.0/2.0, -1.0];
  //scale = [this.res[2] / this.res[0],this.res[2] / this.res[1],-1.0];
  //scale = [0.5,1.3,-1]
  if (this.flipY) scale[1] = -scale[1];
  this.webgl.modelView.scale(scale);

  //Texturing
  //this.gl.uniform1i(this.program.uniforms["slice"], ));
  this.gl.uniform3f(this.program.uniforms['slice'], this.slices[0] / res_size, this.slices[1] / res_size, this.slices[2]);
  this.gl.uniform2f(this.program.uniforms["dim"], this.dimx, this.dimy);
  this.gl.uniform3i(this.program.uniforms["res"], this.res[0], this.res[1], this.res[2]);
  this.gl.uniform1i(this.program.uniforms["axis"], view.axis);
  //Convert [0,1] selection coords to pixel coords
  this.gl.uniform2i(this.program.uniforms["select"], vp.width * sel[0] + vp.x, vp.height * sel[1] + vp.y);

  this.webgl.initDraw2d();

  this.gl.enable(this.gl.BLEND);

  //Draw, single pass
  this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
  this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, this.webgl.vertexPositionBuffer.numItems);
}

Slicer.prototype.drawBrushShader = function(idx) {
  
  //console.log(idx);
  var view = this.viewers[idx];
  //console.log(view);
  var vp = view.viewport;

  //Set selection crosshairs
  var sel;
  if (view.rotate == -90) {

      sel = [this.slices[view.j] / res_size, 1.0 - this.slices[view.i]];

  }
  else if (view.rotate == 180) {

      sel = [1 - this.slices[view.i] / res_size, 1 - this.slices[view.j]];

  }
  else if (view.rotate == 360) {

      sel = [1 - this.slices[view.i], this.slices[view.j]];

  }
  else {

      if( view.axis===2 )
        sel = [this.slices[view.i] / res_size, this.slices[view.j] / res_size];
      else if( view.axis===1 )
        sel = [this.slices[view.i] / res_size, this.slices[view.j]];
      else if( view.axis===0 )
        sel = [this.slices[view.i], this.slices[view.j] / res_size];

  }

  
  
  //Swap y-coord
  if (!this.flipY) sel[1] = 1.0 - sel[1];

  this.brushWebgl.viewport = vp;
  this.brushGl.scissor(vp.x, vp.y, vp.width, vp.height);
  //console.log(JSON.stringify(vp));

  //Apply translation to origin, any rotation and scaling (inverse of zoom factor)
  this.brushWebgl.modelView.identity()
  this.brushWebgl.modelView.translate([0.5, 0.5, 0])
  this.brushWebgl.modelView.rotate(-view.rotate, [0, 0, 1]);

  //Apply zoom and flip Y
  var scale = [1.0/2.0, -1.0/2.0, -1.0];
  //scale = [this.res[2] / this.res[0],this.res[2] / this.res[1],-1.0];
  //scale = [0.5,1.3,-1]
  if (this.flipY) scale[1] = -scale[1];
  this.brushWebgl.modelView.scale(scale);

  //Texturing
  //this.gl.uniform1i(this.program.uniforms["slice"], ));
  this.brushGl.uniform3f(this.brushProgram.uniforms['slice'], this.slices[0] / res_size, this.slices[1] / res_size, this.slices[2]);
  this.brushGl.uniform2f(this.brushProgram.uniforms["dim"], this.dimx, this.dimy);
  this.brushGl.uniform3i(this.brushProgram.uniforms["res"], this.res[0], this.res[1], this.res[2]);
  this.brushGl.uniform1i(this.brushProgram.uniforms["axis"], view.axis);
  //Convert [0,1] selection coords to pixel coords
  this.brushGl.uniform2i(this.brushProgram.uniforms["select"], vp.width * sel[0] + vp.x, vp.height * sel[1] + vp.y);

  //console.log(this.webgl);
  this.brushWebgl.initDraw2d();

  this.brushGl.enable(this.brushGl.BLEND);

  //Draw, single pass
  this.brushGl.blendFunc(this.brushGl.SRC_ALPHA, this.brushGl.ONE_MINUS_SRC_ALPHA);

  this.brushGl.drawArrays(this.brushGl.TRIANGLE_STRIP, 0, this.brushWebgl.vertexPositionBuffer.numItems);
}

Slicer.prototype.drawBrush = function() {

  //XY BUG mouse coord not in view


  for ( key of Object.keys( this.labels ) ) {   

    var brush = this.labels[key];
    var color;

    if (brush.color instanceof Array) {

      color =   rgbToHex( Math.floor(brush.color[0]),
                              Math.floor(brush.color[1]),
                              Math.floor(brush.color[2]));
    } else {

      color =   brush.color;

    }

    //console.log(color);

    var rgb = hexToRgb(color);

    this.overlayCanvasContext.fillStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," +  this.properties.brushTransperency / 255 +")";

    for( viewport of this.viewers ) {

      //var brushSize = viewport.viewport.width / this.dims[0] / res_size * 4;
      var v = viewport.viewport;
      var deepDimension;
      var axis = viewport.axis;
      var rotate = viewport.rotate;
      var xkey;
      var ykey;
      var zkey;

      var voxelWidth;
      var voxelHeight;


      if(axis!==2) { 
        if( viewport.i===2 ) {
          voxelWidth = Math.ceil ( v.width / slicer.res[viewport.i] * res_size );
          voxelHeight = Math.ceil ( v.height / slicer.res[viewport.j]);
        }
        if( viewport.j===2) {
          voxelHeight = Math.ceil ( v.height / slicer.res[viewport.j] * res_size);
          voxelWidth = Math.ceil ( v.width / slicer.res[viewport.i]);
        }
      }
      else{

          voxelWidth = Math.ceil ( v.width / slicer.res[viewport.i] );
          voxelHeight = Math.ceil ( v.height / slicer.res[viewport.j]);

      }
      
      //console.log(voxelWidth,voxelHeight);

      switch(axis){

              case 0:
                deepDimension = this.properties.X;
                xkey = 'z';
                ykey = 'y';
                zkey = 'x';
                break;
              case 1:
                deepDimension = this.properties.Y;
                xkey = 'x';
                ykey = 'z';
                zkey = 'y';
                break;
              case 2:
                deepDimension = this.properties.Z;
                xkey = 'x';
                ykey = 'y';
                zkey = 'z';
                break;

            }
          

      for ( var i = 0; i < brush.lineCoords.length; i++ ) {

          var coords = brush.lineCoords[i];
          //console.log(coords);
          if(axis !== 2)
            var z = deepDimension / this.dims[axis] / res_size;
          else
            var z = deepDimension / this.dims[axis];
          //console.log(coords[zkey] * this.res[axis],  z * this.res[axis]);

          if ( Math.round( coords[zkey] * this.res[axis] ) ===  Math.round ( z * this.res[axis] )) {

              //console.log(this.height - v.y - v.height);
              switch(rotate){
              
                  case -90:
                    var x = ( coords[ykey] ) * v.width + v.x;
                    var y = ( 1 - coords[xkey] ) * v.height + (this.height - v.y - v.height);
                    break;
                  case 180:
                    var x = ( 1 - coords[xkey] ) * v.width + v.x;
                    var y = ( 1 - coords[ykey] ) * v.height + (this.height - v.y - v.height);
                    break;
                  default:
                    var x = ( coords[xkey] ) * v.width + v.x;
                    var y = ( coords[ykey] ) * v.height + (this.height - v.y - v.height);
                    //console.log(y);

                    break;
              
                }

                var imgData = this.overlayCanvasContext.createImageData(voxelWidth,voxelHeight);
                
                
                for (var j = 0; j < imgData.data.length; j+=4) {
        
                  // R
                  imgData.data[j] = rgb.r;
                  // G
                  imgData.data[j+1] = rgb.g;
                  // B
                  imgData.data[j+2] = rgb.b;
                  // Alpha
                  imgData.data[j+3] = 255;
                  
                }
                                
                this.overlayCanvasContext.putImageData(imgData, x, y);
              

          }

      }
  }

  }


}

Slicer.prototype.exportBrush = function() {

  console.log('export');

  var ctx = this.exportCanvas.getContext('2d');
  ctx.clearRect(0, 0, this.exportCanvas.width, this.exportCanvas.height); 
  //--------------------------------------

  function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }


  if (this.currentBrush.color instanceof Array) {
    var color =   rgbToHex( Math.floor(this.currentBrush.color[0]),
                            Math.floor(this.currentBrush.color[1]),
                            Math.floor(this.currentBrush.color[2]));
  } else {

    var color =   this.currentBrush.color;
    
  }

  //ctx.fillStyle = "rgba(255,255,255,1)";

    for( key of Object.keys( this.labels ) ) {

      var brush = this.labels[key];

      //console.log(brush);

      for ( var i = 0; i < brush.lineCoords.length; i++ ) {

        var row = Math.ceil( brush.lineCoords[i].z*this.res[2] /  this.dimx );
        //console.log(row);
        var col = Math.ceil( brush.lineCoords[i].z*this.res[2] % this.dimx );
        //console.log(col);

        var x = brush.lineCoords[i].x*this.res[0] + col * this.res[0];
        var y = brush.lineCoords[i].y*this.res[1] + row * this.res[1];

        x = Math.round(x);
        y = Math.round(y);

        //console.log(brush.lineCoords[i].x,brush.lineCoords[i].y);
        console.log(x,y);

        var imgData = ctx.createImageData(1,1);

        //console.log(ctx);

        for (var j = 0; j < imgData.data.length; j+=4) {

          //console.log(imgData.data);
          // R
          imgData.data[j] = Math.ceil(brush.color[0]);
          // G
          imgData.data[j+1] = Math.ceil(brush.color[1]);
          // B
          imgData.data[j+2] = Math.ceil(brush.color[2]);
          // Alpha
          imgData.data[j+3] = 255;
          
        }

        //console.log(row, col, this.currentBrush.lineCoords[i].z * slicer.res[2]);

        ctx.putImageData(imgData, x, y);

        //console.log('putData');
    }
  }
  console.log('export finish');

  var exportImage =  this.exportCanvas.toDataURL("image/png");
  
  window.open(exportImage, '_blank');

}

Slicer.prototype.importBrush = function() {

  var imageName;

  if ( res_size === 1  ) {
    
    imageName = this.properties.importAtlasUrl + '-l';
    
  } else if ( res_size === 2 ) {

    imageName = this.properties.importAtlasUrl + '-m';

  }  else if ( res_size === 4 ) {
    
    imageName = this.properties.importAtlasUrl + '-s';
    
  }  else if ( res_size ===  8 ) {
    
    imageName = this.properties.importAtlasUrl + '-xs';
    
  }

  loadImage(imageName, function () {
    var image = new Image();
    var headers = request.getAllResponseHeaders();
    var match = headers.match( /^Content-Type\:\s*(.*?)$/mi );
    var mimeType = match[1] || 'image/png';
    var blob = new Blob([request.response], {type: mimeType} );
    image.src =  window.URL.createObjectURL(blob);
    var imageElement = document.createElement("img");

    image.onload = function () {
    
      slicer.brushWebgl = new WebGL(slicer.brushCanvas);
      slicer.brushGl = slicer.brushWebgl.gl;
    
      slicer.brushFilter = slicer.brushGl.NEAREST; //Nearest-neighbour (default)
    
      //Use the default buffers
      slicer.brushWebgl.init2dBuffers(slicer.gl.TEXTURE2);
    
      //Compile the shaders
      slicer.brushProgram = new WebGLProgram(slicer.brushGl, 'texture-vs', 'texture-fs');
      if (slicer.brushProgram.errors) OK.debug(slicer.brushProgram.errors);
      slicer.brushProgram.setup(["aVertexPosition"], ["palette", "texture", "colourmap", "cont", "bright", "power", "slice", "dim", "res", "axis", "select"]);

      slicer.brushGl.clearColor(0, 0, 0, 0);
      slicer.brushGl.enable(slicer.brushGl.BLEND);
      slicer.brushGl.blendFunc(slicer.brushGl.SRC_ALPHA, slicer.brushGl.ONE_MINUS_SRC_ALPHA);
      slicer.brushGl.enable(slicer.brushGl.SCISSOR_TEST);
      
      slicer.loadImage(image, true);

      slicer.isImportTextureLoaded = true;
      slicer.brushColourMap = [];
      slicer.brushColourMap.push({ "position": 0, "colour": "rgba(0,0,0,0.00)" });

      console.log("Loaded image: " + image.width + " x " + image.height);

      var canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext('2d').drawImage(image, 0, 0, image.width, image.height);
      var ctx = canvas.getContext('2d');


      console.log('brush import begin');

      var labelIndex = 1;
      var labelsColor = {};

      var pix = ctx.getImageData(0,0, image.width,image.height).data
      //console.log(pix.length );
      for( var i = 0; i<pix.length; i+=4 ) {
          
          var r = pix[i];
          var g = pix[i+1];
          var b = pix[i+2];
          var a = pix[i+3];
          //console.log(i );
      
          if( (r!==0 || g!==0|| b!==0) )  {

            var pixely = Math.floor( (i / 4) /  image.width);
            var pixelx = Math.floor( (i / 4) %  image.width);
            
            var row =  Math.floor( pixely / slicer.res[1] );
            var col =  Math.floor( pixelx / slicer.res[0]  );
            
            var z = row * slicer.dimx  + col;
        
            var x = (  pixelx % ( slicer.res[0] ));
            var y = (  pixely % ( slicer.res[1] ));
            
          
            x = x /  slicer.res[0] * 1;
            y = y /  slicer.res[1] * 1;
            z = z /  slicer.res[2] * 1;

            var hexColor =  rgbToHex(r, g, b);
            

            if ( labelsColor[ hexColor ]  === undefined ) {

              labelsColor[ hexColor ] = 1;

              slicer.labels [ labelIndex ] =  {
                
                    label: labelIndex,
                    color: [r,g,b],
                    lineCoords:[],
                
              }

              labelIndex++;

              slicer.brushColourMap.push({ "position": 0, "colour": "rgba("+r+","+g+","+b+",1.00)" });

            } 

        }

      }

    

    for ( var i = 1; i < slicer.brushColourMap.length; i++ ) {
      
      slicer.brushColourMap[i].position  =  1 / slicer.brushColourMap.length * i;

    }

    slicer.colours.read(slicer.brushColourMap);

    slicer.colours.update();

    console.log('brush import finish');

    var f3 = slicer.gui.__folders['Сегментации'];
 
    f3.__controllers[f3.__controllers.length-1].remove();
        
    f3.add( slicer.currentItem, 'label', Object.keys(slicer.labels) ).onChange(function(val) {
              
        slicer.currentBrush = slicer.labels[ val ];
        
        slicer.draw();
        
        for (var i in f3.__controllers) {
          f3.__controllers[i].updateDisplay();
        }
              
    });
    
    if(slicer.properties.enableBrush || slicer.properties.showBrush) slicer.draw();

    }
  }
  );

}

Slicer.prototype.updateBrushColourMap  = function () {
  
  if (!slicer.colours) return;
  
  slicer.colours.palette.draw(slicer.brushGradient, false);

  if (slicer.brushWebgl)
  slicer.brushWebgl.updateTexture(slicer.brushWebgl.gradientTexture, slicer.brushGradient, slicer.brushGl.TEXTURE2);  //Use 2nd texture unit

}

Slicer.prototype.drawIntersections = function() {

  function drawRect ( x,y,width,height, overlayCanvasContext ) {
    
    if (volume.interSectionBoxes[boxkey].color['red']) {
      var color =   rgbToHex( Math.floor(volume.interSectionBoxes[boxkey].color['red']),
                              Math.floor(volume.interSectionBoxes[boxkey].color['green']),
                              Math.floor(volume.interSectionBoxes[boxkey].color['blue']));
    } else {

      var color =   rgbToHex( Math.floor(volume.interSectionBoxes[boxkey].color[0]),
                              Math.floor(volume.interSectionBoxes[boxkey].color[1]),
                              Math.floor(volume.interSectionBoxes[boxkey].color[2]));
    }
    if ( typeof volume.interSectionBoxes[boxkey].color ===  'string' )
      color = volume.interSectionBoxes[boxkey].color;
    
    //console.log(x,y,width,height);

    overlayCanvasContext.beginPath();                        
    overlayCanvasContext.strokeStyle = color;
    overlayCanvasContext.lineWidth=2;
    //+5 offset
    overlayCanvasContext.rect(x,y,width,height);
    overlayCanvasContext.stroke();

    //console.log(x,y,width,height, rotate);

  }


  for( viewport of this.viewers ) {
    var i = viewport.i;
    var j = viewport.j;
    var axis = viewport.axis;
    var rotate = viewport.rotate;
    var v = viewport.viewport;
    var deepDimension;
    //console.log(i,j);
    switch(axis){

      case 0:
        deepDimension = this.properties.X / res_size;

        break;
      case 1:
        deepDimension = this.properties.Y / res_size;

        break;
      case 2:
        deepDimension = this.properties.Z;

        break;

    }

    for ( boxkey of Object.keys(volume.interSectionBoxes) ) {

      var minD = volume.interSectionBoxes[boxkey].minVertices[axis];
      var maxD = volume.interSectionBoxes[boxkey].maxVertices[axis];

      if( minD < deepDimension/this.dims[axis] && maxD > deepDimension/this.dims[axis]) {


        if (rotate ===90){

          console.log(90);

        }
        else if (rotate === -90) {

          
          var x = volume.interSectionBoxes[boxkey].minVertices[j] * v.width + v.x;
          var width = ( volume.interSectionBoxes[boxkey].maxVertices[j] - volume.interSectionBoxes[boxkey].minVertices[j] ) * v.width;

          var y = ( 1 - volume.interSectionBoxes[boxkey].minVertices[i] ) * v.height + (this.height - v.y - v.height);
          var height = ( volume.interSectionBoxes[boxkey].maxVertices[i] - volume.interSectionBoxes[boxkey].minVertices[i]) * v.height * -1;

        }
        else if (rotate === 180) {

          var x = ( 1 - volume.interSectionBoxes[boxkey].minVertices[i] ) * v.width + v.x;
          var width = ( volume.interSectionBoxes[boxkey].maxVertices[i] - volume.interSectionBoxes[boxkey].minVertices[i] )  * v.width * -1;

          var y = ( 1 - volume.interSectionBoxes[boxkey].minVertices[j] )* v.height + (this.height - v.y - v.height); 
          var height =  ( volume.interSectionBoxes[boxkey].maxVertices[j] - volume.interSectionBoxes[boxkey].minVertices[j]) * v.height * -1;

        }
        else {

          var x = volume.interSectionBoxes[boxkey].minVertices[i] * v.width + v.x;
          var width = ( volume.interSectionBoxes[boxkey].maxVertices[i] - volume.interSectionBoxes[boxkey].minVertices[i] ) * v.width;

          var y = volume.interSectionBoxes[boxkey].minVertices[j] * v.height + (this.height - v.y - v.height);
          var height = ( volume.interSectionBoxes[boxkey].maxVertices[j] - volume.interSectionBoxes[boxkey].minVertices[j]) * v.height;

        }

        //console.log( volume.interSectionBoxes[boxkey].minVertices , volume.interSectionBoxes[boxkey].maxVertices);

        drawRect( x,y,width,height, this.overlayCanvasContext);

      }


    } 

  }


}

function SliceView(slicer, x, y, axis, rotate, magnify) {
  this.axis = axis;
  this.slicer = slicer;

  this.magnify = magnify || 1.0;
  this.origin = [0.5,0.5];
  this.rotate = rotate || 0;

  //Calc viewport
  this.i = 0;
  this.j = 1;
  if (axis == 0) this.i = 2;
  if (axis == 1) this.j = 2;

  //console.log(slicer.dims);
  var dimI = this.i === 2? slicer.dims[this.i] / res_size: slicer.dims[this.i];
  var dimJ = this.j === 2? slicer.dims[this.j] / res_size: slicer.dims[this.j];

  var w = Math.round(dimI * slicer.properties.zoom * this.magnify);
  var h = Math.round(dimJ * slicer.properties.zoom * this.magnify);

  if (this.rotate == 90)
    this.viewport = new Viewport(x, y, h, w);
  else if (this.rotate == -90)
    this.viewport = new Viewport(x, y, h, w);
  else
    this.viewport = new Viewport(x, y, w, h);

  //Border and mouse interaction element
  this.div = document.createElement("div");
  this.div.style.cssText = "padding: 0px; margin: 0px; outline: 2px solid rgba(64,64,64,0.5); position: absolute; display: inline-block; pointer-events: auto;";
  this.div.id = "slice-div-" + axis;

  this.div.style.left = x + "px";
  this.div.style.bottom = y + "px";

  //console.log(w,h,x,y);

  this.div.style.width = this.viewport.width + "px";
  this.div.style.height = this.viewport.height + "px";

  this.div.mouse = new Mouse(this.div, this);
}

SliceView.prototype.click = function(event, mouse) {

  //console.log(this);

  var view = this;

  function isCursorInView() {

    return ( mouse.x  + view.viewport.x ) < ( view.viewport.x + view.viewport.width ) 
            && ( mouse.x  + view.viewport.x ) > view.viewport.x
            &&( mouse.y  + view.viewport.y ) < ( view.viewport.y + view.viewport.height)
            && ( mouse.y > 0 )

  }

  if (this.slicer.flipY) mouse.y = mouse.element.clientHeight - mouse.y;

  var coord;

  //Rotated?
  if (this.rotate == 90)
    coord = [mouse.y / mouse.element.clientHeight, 1.0 - mouse.x / mouse.element.clientWidth];
  else if (this.rotate == -90)
    coord = [1 - mouse.y / mouse.element.clientHeight, mouse.x / mouse.element.clientWidth];
  else if (this.rotate == 180)
    coord = [1 - mouse.x / mouse.element.clientWidth,1 - mouse.y / mouse.element.clientHeight];
  else if (this.rotate == 360)
    coord = [1 - mouse.x / mouse.element.clientHeight, mouse.y / mouse.element.clientWidth];
  else 
    coord = [mouse.x / mouse.element.clientWidth, mouse.y / mouse.element.clientHeight];

  var A = Math.round(this.slicer.res[this.i] * coord[0]);
  var B = Math.round(this.slicer.res[this.j] * coord[1]);

  // 0-1 ok remove negative values 
  //console.log(coord);

  var newBrushCoords ={};

  if (this.axis == 0) {
    slicer.properties.Z = A;
    slicer.properties.Y = B * res_size;
    
    newBrushCoords.z = coord[0];
    newBrushCoords.y = coord[1];
    newBrushCoords.x = slicer.properties.X / this.slicer.res[0] / res_size;

  } else if (this.axis == 1) {
    slicer.properties.X = A * res_size;
    slicer.properties.Z = B;

    newBrushCoords.x = coord[0];
    newBrushCoords.z = coord[1];
    newBrushCoords.y = slicer.properties.Y / this.slicer.res[1] / res_size;
    
  } else {
    slicer.properties.X = A * res_size;
    slicer.properties.Y = B * res_size;

    newBrushCoords.x = coord[0];
    newBrushCoords.y = coord[1];
    newBrushCoords.z = slicer.properties.Z / this.slicer.res[2];
  }

  //console.log(this.viewport);

  if( this.slicer.properties.enableBrush && isCursorInView() )
  this.slicer.currentBrush.lineCoords.push( newBrushCoords );

  this.slicer.draw();
}

SliceView.prototype.wheel = function(event, mouse) {
  if (this.axis == 0) slicer.properties.X += event.spin;
  if (this.axis == 1) slicer.properties.Y += event.spin;
  if (this.axis == 2) slicer.properties.Z += event.spin;

  //console.log(slicer.properties.X,slicer.properties.Y,slicer.properties.Z);

  this.slicer.draw();
}

SliceView.prototype.move = function(event, mouse) {
  if (mouse.isdown) this.click(event, mouse);
}


