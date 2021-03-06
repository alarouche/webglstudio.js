var AnimationModule = {
	name: "Timeline",
	enabled: true,

	render_helpers: true,
	//settings_panel: [{name:"renderer", title:"Renderer", icon:null }],

	_trajectories: [],

	init: function()
	{
		this.tab = InterfaceModule.lower_tabs_widget.addTab("Animation", {selected:true, size: "full", width: "100%"});
		this.tab.content.style.overflow = "hidden"; 
		this.createTimeline();

		LEvent.bind( LS.GlobalScene, "afterRenderScene", this.renderView.bind(this));
		LEvent.bind( LS.GlobalScene, "renderPicking", this.renderPicking.bind(this));

		RenderModule.viewport3d.addModule( AnimationModule ); //capture update, render trajectories
	},

	createTimeline: function()
	{
		var timeline = this.timeline = new Timeline();
		this.tab.add( this.timeline );

		InterfaceModule.visorarea.addEventListener( "visibility_change", timeline_resize );
		InterfaceModule.visorarea.addEventListener( "split_moved", timeline_resize );
		window.addEventListener("resize", timeline_resize );

		function timeline_resize(){
			timeline.resize();
		}
	},

	showTimeline: function( animation )
	{
		InterfaceModule.selectTab( RenderModule.name );
		InterfaceModule.setLowerPanelVisibility( true );
		if(animation)
			this.timeline.setAnimation( animation );
	},

	attachKeyframesBehaviour: function( inspector )
	{
		var elements = inspector.root.querySelectorAll(".keyframe_icon");
		for(var i = 0; i < elements.length; i++)
		{
			elements[i].addEventListener("click", inner_click );
			elements[i].addEventListener("contextmenu", (function(e) { 
				if(e.button != 2) //right button
					return false;
				inner_rightclick(e);
				e.preventDefault();
				e.stopPropagation();
				return false;
			}).bind(this));
		}

		function inner_click(e)
		{
			AnimationModule.insertKeyframe( e.target, e.shiftKey );
			e.preventDefault();
			e.stopPropagation();
			return true;
		}

		function inner_rightclick(e)
		{
			var menu = new LiteGUI.ContextualMenu( ["Add UID track","Add name track","Show Info"], { event: e, callback: function(value) {
				if(value == "Add UID track")
					AnimationModule.insertKeyframe(e.target);
				else if(value == "Add name track")
					AnimationModule.insertKeyframe(e.target, true);
				else
					AnimationModule.showPropertyInfo( e.target.dataset["propertyuid"] );
			}});
		}
	},

	showPropertyInfo: function( property )
	{
		var info = LS.GlobalScene.getPropertyInfo( property );
		if(!info)
			return;

		var that = this;
		var dialog = new LiteGUI.Dialog("property_info",{ title:"Property Info", width: 400, draggable: true, closable: true });
		
		var widgets = new LiteGUI.Inspector();
		widgets.addString("Locator", property, function(v){ 
		});

		widgets.widgets_per_row = 2;
		widgets.addString("Parent", info.node ? info.node.name : "", { disabled: true } );
		widgets.addString("Container", info.target ? LS.getObjectClassName( info.target ) : "", { disabled: true } );
		widgets.addString("Property", info.name, { disabled: true } );
		widgets.addString("Type", info.type, { disabled: true } );
		widgets.widgets_per_row = 1;

		if(info.type == "number")
			widgets.addNumber("Value", info.value, inner_set );
		else if(info.type == "boolean")
			widgets.addCheckbox("Value", info.value, inner_set );
		else if(info.type == "vec2")
			widgets.addVector2("Value", info.value, inner_set );
		else if(info.type == "vec3")
			widgets.addVector3("Value", info.value, inner_set );
		else if(info.type == "texture")
			widgets.addTexture("Value", info.value, inner_set );
		else if(info.type == "mesh")
			widgets.addMesh("Value", info.value, inner_set );
		else
			widgets.addString("Value", info.value, inner_set );
		widgets.addButtons(null,["Close"], function(v){
			dialog.close();
			return;
		});

		dialog.add( widgets );
		dialog.adjustSize();
		dialog.show();

		function inner_set(v)
		{
			LS.GlobalScene.setPropertyValue( property, v );
			LS.GlobalScene.refresh();
		}
	},

	getKeyframeCode: function( target, property, options )
	{
		if(!target.getLocator)
			return "";
		var locator = target.getLocator();
		if(!locator)
			return "";
		return "<span title='Create keyframe' class='keyframe_icon' data-propertyname='" + property + "' data-propertyuid='" + locator + "/" + property + "' ></span>";
	},

	insertKeyframe: function( button, relative )
	{
		this.timeline.onInsertKeyframeButton(button, relative);
	},

	renderView: function(e, camera)
	{
		if( !EditorView.render_helpers || !this.render_helpers || RenderModule.render_options.in_player || !RenderModule.frame_updated )
			return;

		this.renderTrajectories(camera);
	},

	renderPicking: function(e, mouse_pos)
	{
		//cannot pick what is hidden
		if(!EditorView.render_helpers)
			return;

		for(var i = 0; i < this._trajectories.length; ++i)
		{
			var track = this._trajectories[i];
			var points = track.points;
			var num = points.length;
			for(var j = 0; j < num; ++j)
			{
				var pos = points[j];
				EditorView.addPickingPoint( pos, 10, { type: "keyframe", traj:i, instance: this, track: track.index, num: j } );
			}
		}
	},

	renderTrajectories: function(camera)
	{
		LS.Renderer.resetGLState();

		if(!this.timeline.current_take)
			return;

		var take = this.timeline.current_take;
		if(take.tracks.length == 0)
			return;

		var selection = SelectionModule.getSelection();
		if(!selection || selection.type != "keyframe")
			selection = null;

		this._trajectories.length = 0;
		var white = [1,1,1,1];
		var colorA = [0.5,0.6,0.5,1];
		var colorB = [1.0,1.0,0.5,1];

		for(var i = 0; i < take.tracks.length; ++i)
		{
			var track = take.tracks[i];
			if(track.type != "position" || !track.enabled)
				continue;

			var num = track.getNumberOfKeyframes();
			var start = -1;
			var end = -1;
			var points = [];
			var colors = null;
			if( selection && selection.track == i )
				colors = [];

			for(var j = 0; j < num; ++j)
			{
				var keyframe = track.getKeyframe(j);
				if(!keyframe)
					continue;
				if(j == 0)
					start = keyframe[0];
				else if(j == num - 1)
					end = keyframe[0];
				var pos = keyframe[1];
				points.push(pos);
				if(colors)
					colors.push( j == selection.index ? colorB : colorA );
			}

			Draw.setColor( colors ? white : colorA );
			Draw.renderPoints( points, colors );
			this._trajectories.push( { index: i, points: points } );

			if(track.interpolation == LS.Animation.NONE)
				continue;

			if(track.interpolation == LS.Animation.LINEAR)
			{
				if(points.length > 1)
					Draw.renderLines( points, null, true );
				continue;
			}

			points = [];

			var last = null;
			for(var j = 0; j < num; ++j)
			{
				var keyframe = track.getKeyframe(j);
				if(!keyframe)
					continue;
				if(last)
				{
					var start_t = last[0];
					var end_t = keyframe[0];
					var num_samples = Math.max(2, (end_t - start_t) * 10);
					var offset = (end_t - start_t) / num_samples;
					for(var k = 0; k <= num_samples; ++k)
					{
						var t = start_t + offset * k;
						var sample = track.getSample(t, true, vec3.create());
						if(!sample)
							continue;
						points.push(sample);
					}
				}
				last = keyframe;
			}

			if(points.length > 1)
			{
				Draw.setColor(colorA);
				Draw.renderLines( points, null, false );
			}
		}
	},

	getTransformMatrix: function( element, mat, selection )
	{
		if(!this._trajectories.length)
			return false;

		var track = this._trajectories[ selection.traj ];
		if(!track)
			return null;

		var T = mat || mat4.create();
		mat4.setTranslation( T, track.points[ selection.num ] );
		return T;
	},

	applyTransformMatrix: function( matrix, center, property_name, selection )
	{
		if(!this._trajectories.length)
			return false;

		var track = this._trajectories[ selection.traj ];
		if(!track)
			return null;

		var point = track.points[ selection.num ];
		vec3.transformMat4( point, point, matrix );
		this.timeline.applyTracks();
		return true;
	},

	update: function(dt)
	{
		if( this.timeline )
			this.timeline.update(dt);
	}

};

LiteGUI.registerModule( AnimationModule );