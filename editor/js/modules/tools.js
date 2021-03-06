/*
	This module allows to change the tool used by the mouse when interacting with the viewport.
	properties:
	- name, description: info
	- icon: image
	- module: this will be the one receiving all the events, if no module is supplied the tool is used as the module
	- onEnable: callback when the tool is enabled
	- onDisable: callback when the tool is disabled
*/

var ToolsModule = {
	name: "tools",

	tool: 'select',

	current_tool: null,
	tools: {},
	buttons: {},

	coordinates_system: 'object',

	_initialized: false,
	_active_camera: null, //camera under the mouse

	init: function() {

		for(var i in this.tools)
		{
			var tool = this.tools[i];
			if(tool.module && tool.module.onRegister)
			{
				tool.module.onRegister();
				tool.module.onRegister = null; //UGLY
			}
		}

		//initGUI
		//place to put all the icons of the tools
		RenderModule.viewport3d.addModule(this);
		this.createToolbar();

		//testing features
		//LEvent.bind( LS.GlobalScene, "afterRenderScene", this.renderView.bind(this));

		LiteGUI.menubar.add("View/Tools menu", { callback: function() { $("#visor .tool-section").fadeIn(); }});
	},

	registerTool: function(tool)
	{
		this.tools[tool.name] = tool;
	},

	registerButton: function(button)
	{
		this.buttons[button.name] = button;
	},

	keydown: function(e)
	{
		for(var i in ToolsModule.tools)
		{
			if(ToolsModule.tools[i].keyShortcut == e.keyCode)
			{
				ToolsModule.enableTool( ToolsModule.tools[i].name );
				break;
			}
		}
	},

	enableTool: function(name)
	{
		if(this.current_tool) {

			//avoid to reactivate same tool
			if(this.current_tool.name == name)
			{
				if( this.current_tool.onClick )
					this.current_tool.onClick();
				return;
			}

			if(this.current_tool.module) 
			{
				if(!this.current_tool.keep_module)
					RenderModule.viewport3d.removeModule(this.current_tool.module);
				this.current_tool.module.enabled = false;
			}
			else if(!this.current_tool.keep_module)
				RenderModule.viewport3d.removeModule(this.current_tool);
			this.current_tool.enabled = false;
			if (this.current_tool.onDisable)
				this.current_tool.onDisable();
		}

		$("#canvas-tools .tool-button.enabled").removeClass("enabled");

		this.current_tool = null;
		var tool = this.tools[name];
		if(!tool) return;

		//$("#canvas-tools .tool-" + name).addClass("selected");

		this.current_tool = tool;
		if( this.current_tool.onClick )
			this.current_tool.onClick();

		if(tool.module)
		{ 
			RenderModule.viewport3d.addModule(tool.module);
			tool.module.enabled = true;
		}
		else RenderModule.viewport3d.addModule(tool);
		this.current_tool.enabled = true;

		if (this.current_tool.onEnable)
			this.current_tool.onEnable();
		$(this).trigger("tool_enabled", this.current_tool );
		LS.GlobalScene.refresh();
	},

	//every frame
	render: function()
	{
		if (!this.current_tool || !RenderModule.frame_updated) 
			return;

		if(!this._active_camera)
			return;
		var camera = this._active_camera;
		LS.Renderer.enableCamera(camera); //sets viewport, update matrices and set Draw
		/*
		var viewport = camera.getLocalViewport( LS.Renderer._full_viewport );
		gl.viewport( viewport[0], viewport[1], viewport[2], viewport[3] );
		*/
		this.renderView(null, camera);

		/*
		var cameras = RenderModule.cameras;
		var viewport = vec4.create();
		for(var i = 0; i < cameras.length; i++)
		{
			var camera = cameras[i];
			camera.getLocalViewport( LS.Renderer._full_viewport, viewport );
			gl.viewport( viewport[0], viewport[1], viewport[2], viewport[3] );
			this.renderView(null, camera);
		}
		*/
	},

	renderView: function(e, camera)
	{
		if (!this.current_tool)
			return;

		if( this.current_tool.renderEditor )
			this.current_tool.renderEditor( camera );
	},

	mousemove: function(e)
	{
		if(e.dragging)
			return;

		var camera = RenderModule.getCameraUnderMouse(e);
		if(!camera || camera == this._active_camera)
			return;

		this._active_camera = camera;
		LS.GlobalScene.refresh();
	},

	createToolbar: function()
	{
		//in case they exist
		$("#canvas-tools").remove();
		$("#canvas-buttons").remove();

		var root = LiteGUI.getById("visor");
		if(!root)
		{
			console.error("No #visor element found");
			return;
		}

		$(root).append("<div id='canvas-tools' class='ineditor'></div>");
		$(root).append("<div id='canvas-buttons' class='ineditor'></div>");

		for(var i in this.tools)
		{
			var tool = this.tools[i];
			if(tool.display == false) continue;
			this.addToolButton(tool);
		}

		for(var i in this.buttons)
		{
			var button = this.buttons[i];
			if(button.display == false) continue;
			this.addStateButton(button);
		}
	},

	addToolButton: function( tool )
	{
		var root = document.getElementById("canvas-tools");

		var element = this.createButton(tool, root );
		element.className += " tool-" + tool.name + " " + (tool.enabled ? "enabled":"");

		$(element).click(function(e){
			ToolsModule.enableTool(this.data);
			LS.GlobalScene.refresh();
			$("#canvas-tools .enabled").removeClass("enabled");
			$(this).addClass("enabled");
		});
	},

	addStateButton: function( button )
	{
		var root = document.getElementById("canvas-buttons");

		var element = this.createButton(button, root);
		element.className += " tool-" + button.name + " " + (button.enabled ? "enabled":"");

		$(element).click(function(e){
			if(button.combo)
			{
				var section_name = "tool-section-" + button.section;
				$(root).find("." + section_name + " .tool-button").removeClass("enabled");
			}

			if(!button.callback)
				return;

			var ret = button.callback();
			if(typeof(ret) != "undefined")
			{
				if(ret)
					$(this).addClass("enabled");
				else
					$(this).removeClass("enabled");
			}
			else if(!button.combo)
				$(this).toggleClass("enabled");
			else
				$(this).addClass("enabled");
			LS.GlobalScene.refresh();

			e.preventDefault();
			return false;
		});

		//if(button.enabled)
		//	$(element).click();
	},

	createButton: function(button, root)
	{
		var element = document.createElement("div");
		element.className = "tool-button";
		element.data = button.name;
		if (button.icon) {
			element.style.backgroundImage = "url('" + button.icon + "')";
		}
		//element.innerHTML = button.name;
		if(button.description) element.title = button.description;

		if(!button.section)
			button.section = "general";

		var section = root.querySelector(".tool-section-" + button.section);

		if( !section )
		{
			var section_element = document.createElement("div");
			section_element.className = "tool-section tool-section-" + button.section;
			root.appendChild(section_element);
			section = section_element;
		}

		$(section).append(element);
		return element;
	}
};

LiteGUI.registerModule( ToolsModule );

//************* TOOLS *******************
var ToolUtils = {
	click_point: vec3.create(),

	getCamera: function(e)
	{
		if(!e)
			return ToolsModule._active_camera || RenderModule.camera;

		var x = e.canvasx;
		var y = e.canvasy;

		var cameras = RenderModule.cameras;
		var camera = cameras[0];
		for(var i = cameras.length-1; i >= 0; --i)
		{
			if( cameras[i].isPointInCamera( x,y ) )
			{
				camera = cameras[i];
				break;
			}
		}
		return camera;
	},

	getCamera2D: function()
	{
		if(!this.camera_2d)
			this.camera_2d = new LS.Camera({eye:[0,0,0],center:[0,0,-1]});
		return this.camera_2d;
	},


	prepareDrawing: function()
	{
		var camera = this.getCamera();
		this.camera_eye = camera.getEye();
		this.camera_front = camera.getFront();
		this.camera_top = camera.getLocalVector([0,1,0]);
		this.camera_right = camera.getLocalVector([1,0,0]);
	},

	enableCamera2D: function(camera)
	{
		var camera2d = this.getCamera2D();

		if(camera) //copy viewport
			camera2d._viewport.set( camera._viewport );

		var viewport = camera2d.getLocalViewport(); //should be the same as gl.viewport_data

		camera2d.setOrthographic( viewport[0], viewport[0] + viewport[2], viewport[1], viewport[1] + viewport[3], -1, 1);
		camera2d.updateMatrices();
		Draw.setViewProjectionMatrix( camera2d._view_matrix, camera2d._projection_matrix, camera2d._viewprojection_matrix );
		
		return camera2d;
	},

	getSelectionMatrix: function()
	{
		var m = SelectionModule.getSelectionTransform();

		if(m && ToolsModule.coordinates_system == 'world')
		{
			var pos = vec3.create();
			mat4.multiplyVec3( pos, m, pos );
			mat4.identity( m );
			mat4.setTranslation( m, pos );
		}

		return m;
	},

	/*
	//returns the matrix for the selected gizmo
	getNodeGizmoMatrix: function(node)
	{
		if(!node) return null;
		var model = null;
		var center = null;
		var camera = this.getCamera();
		
		if(node.transform)
		{
			center = node.transform.getGlobalPosition();
			if(ToolsModule.coordinates_system == 'object')
				model = node.transform.getMatrixWithoutScale();
			else if(ToolsModule.coordinates_system == 'world')
				model = node.transform.getMatrixWithoutRotation();
			else if(ToolsModule.coordinates_system == 'view')
			{
				var up = this.camera_up;
				model = mat4.lookAt(mat4.create(), center, vec3.subtract( vec3.create(), center, this.camera_eye ), up );
				mat4.invert(model, model);
			}
		}
		else
			return mat4.create();
		return model;
	},
	*/

	applyTransformToSelection: function(transform, center, node)
	{
		SelectionModule.applyTransformToSelection(transform, center, node);
	},

	applyTransformMatrixToSelection: function(matrix, center, node)
	{
		SelectionModule.applyTransformMatrixToSelection( matrix, center, node);
	},

	//special case, when transforming a bone you want to preserve the distance with the parent
	applyTransformMatrixToBone: function(matrix)
	{
		var scene = LS.GlobalScene;

		var node = scene.selected_node;
		var parent = node.parentNode;

		var pos = node.transform.getGlobalPosition();
		var parent_model = parent.transform.getGlobalMatrix();
		var parent_pos = parent.transform.getGlobalPosition();

		var end_pos = mat4.multiplyVec3( vec3.create(), matrix, pos );

		var A = vec3.sub( vec3.create(), pos, parent_pos );
		var B = vec3.sub( vec3.create(), end_pos, parent_pos );
		vec3.normalize(A,A);
		vec3.normalize(B,B);

		var axis = vec3.cross( vec3.create(), A, B );
		vec3.normalize(axis,axis);
		var angle = Math.acos( Math.clamp( vec3.dot(A,B), -1,1) );
		if( Math.abs(angle) < 0.00001 )
			return;

		var Q = quat.setAxisAngle( quat.create(), axis, angle);
		var R = mat4.fromQuat( mat4.create(), Q );

		this.applyTransformMatrixToSelection(R, parent_pos, parent );
		//parent.transform.applyTransformMatrix(R, true);
		scene.refresh();
	},
	
	//test the collision point of a ray passing a pixel against a perpendicular plane passing through center
	testPerpendicularPlane: function(x,y, center, result, camera)
	{
		camera = camera || this.getCamera();
		result = result || vec3.create();

		var ray = camera.getRayInPixel( x, gl.canvas.height - y );
		//ray.end = vec3.add( vec3.create(), ray.start, vec3.scale(vec3.create(), ray.direction, 10000) );

		//test against plane
		var front = camera.getFront( this.camera_front );
		if( geo.testRayPlane( ray.start, ray.direction, center, front, result ) )
			return true;
		return false;
	},

	computeRotationBetweenPoints: function(center, pointA, pointB, axis )
	{
		var A = vec3.sub( vec3.create(), pointA, center );
		var B = vec3.sub( vec3.create(), pointB, center );
		vec3.normalize(A,A);
		vec3.normalize(B,B);
		var AcrossB = vec3.cross(vec3.create(),A,B);
		if(!axis)
			axis = AcrossB;

		vec3.normalize(axis, axis);

		var AdotB = vec3.dot(A,B); //clamp
		var angle = -Math.acos( AdotB );
		//if( vec3.dot(AcrossB, axis) < 0 )
		//	angle *= -1;
		var Q = quat.create();
		if(!isNaN(angle))
			quat.setAxisAngle(Q, axis, angle );
		return Q;
	},

	computeDistanceFactor: function(v, camera)
	{
		camera = camera || RenderModule.camera;
		return Math.tan(camera.fov * DEG2RAD) * vec3.dist( v, camera.getEye() );
	},

	//useful generic methods
	saveNodeTransformUndo: function(node)
	{
		UndoModule.saveNodeTransformUndo(node);
	},

	//test if a ray collides circle
	testCircle: function(ray, axis, center, radius, result )
	{
		//test with the plane containing the circle
		if( geo.testRayPlane( ray.start, ray.direction, center, axis, result ) )
		{
			var dist = vec3.dist( result, center );
			var diff = vec3.subtract( result, result, center );
			vec3.scale(diff, diff, 1 / dist); //normalize?
			if( Math.abs(radius - dist) < radius * 0.1 && vec3.dot(diff, ray.direction) < 0.0 )
				return true;
		}
		return false;
	}
};

var notoolButton = {
	name: "notool-button",
	description: "Deselect any tool selected",
	icon: "imgs/mini-icon-circle.png",
	section: "main",

	callback: function()
	{
		ToolsModule.enableTool(null);
		//$("#canvas-tools .enabled").removeClass("enabled");
		return false;
	}
};

ToolsModule.registerButton(notoolButton);

