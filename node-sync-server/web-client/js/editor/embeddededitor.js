/*******************************************************************************
 * @license
 * Copyright (c) 2010, 2011 IBM Corporation and others.
 * Copyright (c) 2012 VMware, Inc.
 * Copyright (c) 2013 GoPivotal, Inc.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 *
 * Contributors: 
 *     IBM Corporation - initial API and implementation
 *     Andrew Eisenberg - rename jsContentAssist to jsTemplateContentAssist
 *     Martin Lippert - flight627 prototype work
 *******************************************************************************/
/*global examples orion:true window define*/
/*jslint browser:true devel:true*/

define([
	"require", 
	"orion/textview/textView",
	"orion/textview/keyBinding",
	"editor/textview/textStyler",
	"orion/editor/textMateStyler",
	"orion/editor/htmlGrammar",
	"orion/editor/editor",
	"orion/editor/editorFeatures",
	"orion/editor/contentAssist",
	"orion/editor/javaContentAssist",
	"editor/sha1",
	"editor/socket.io"],

function(require, mTextView, mKeyBinding, mTextStyler, mTextMateStyler, mHtmlGrammar, mEditor, mEditorFeatures, mContentAssist, mJavaContentAssist){
	var editorDomNode = document.getElementById("editor");
	
	var textViewFactory = function() {
		return new mTextView.TextView({
			parent: editorDomNode,
			tabSize: 4
		});
	};

	var contentAssist;
	var contentAssistFactory = {
		createContentAssistMode: function(editor) {
			contentAssist = new mContentAssist.ContentAssist(editor.getTextView());
			var contentAssistWidget = new mContentAssist.ContentAssistWidget(contentAssist);
			return new mContentAssist.ContentAssistMode(contentAssist, contentAssistWidget);
		}
	};
	
	var socket = io.connect();
	var javaContentAssistProvider = new mJavaContentAssist.JavaContentAssistProvider(socket);
	javaContentAssistProvider.setSocket(socket);
	
	// Canned highlighters for js, java, and css. Grammar-based highlighter for html
	var syntaxHighlighter = {
		styler: null, 
		
		highlight: function(fileName, editor) {
			if (this.styler) {
				this.styler.destroy();
				this.styler = null;
			}
			if (fileName) {
				var splits = fileName.split(".");
				var extension = splits.pop().toLowerCase();
				var textView = editor.getTextView();
				var annotationModel = editor.getAnnotationModel();
				if (splits.length > 0) {
					switch(extension) {
						case "js":
						case "java":
						case "css":
							this.styler = new mTextStyler.TextStyler(textView, extension, annotationModel);
							break;
						case "html":
							this.styler = new mTextMateStyler.TextMateStyler(textView, new mHtmlGrammar.HtmlGrammar());
							break;
					}
				}
			}
		}
	};
	
	var annotationFactory = new mEditorFeatures.AnnotationFactory();
	
	var keyBindingFactory = function(editor, keyModeStack, undoStack, contentAssist) {
		
		// Create keybindings for generic editing
		var genericBindings = new mEditorFeatures.TextActions(editor, undoStack);
		keyModeStack.push(genericBindings);
		
		// create keybindings for source editing
		var codeBindings = new mEditorFeatures.SourceCodeActions(editor, undoStack, contentAssist);
		keyModeStack.push(codeBindings);
		
		// save binding
		editor.getTextView().setKeyBinding(new mKeyBinding.KeyBinding("s", true), "save");
		editor.getTextView().setAction("save", function(){
				save(editor);
				return true;
		});
		
		// speaking of save...
		// document.getElementById("save").onclick = function() {save(editor);};

	};
		
	var dirtyIndicator = "";
	var status = "";
	
	var statusReporter = function(message, isError) {
		/*if (isError) {
			status =  "ERROR: " + message;
		} else {
			status = message;
		}
		document.getElementById("status").innerHTML = dirtyIndicator + status;*/
	};
	
	var editor = new mEditor.Editor({
		textViewFactory: textViewFactory,
		undoStackFactory: new mEditorFeatures.UndoFactory(),
		annotationFactory: annotationFactory,
		lineNumberRulerFactory: new mEditorFeatures.LineNumberRulerFactory(),
		contentAssistFactory: contentAssistFactory,
		keyBindingFactory: keyBindingFactory, 
		statusReporter: statusReporter,
		domNode: editorDomNode
	});
		
	editor.addEventListener("DirtyChanged", function(evt) {
		if (editor.isDirty()) {
			dirtyIndicator = "*";
		} else {
			dirtyIndicator = "";
		}
		
		// alert("Dirty changes: " + editor.__javaObject);
		// document.getElementById("status").innerHTML = dirtyIndicator + status;
	});
	
	editor.installTextView();
	
	// if there is a mechanism to change which file is being viewed, this code would be run each time it changed.
	var contentName = "sample.java";  // for example, a file name, something the user recognizes as the content.
	var initialContent = "window.alert('this is some javascript code');  // try pasting in some real code";
	editor.setInput(contentName, null, initialContent);
	syntaxHighlighter.highlight(contentName, editor);
	contentAssist.addEventListener("Activating", function() {
		contentAssist.setProviders([javaContentAssistProvider]);
	});
	// end of code to run when content changes.
	
	window.onbeforeunload = function() {
		if (editor.isDirty()) {
			 return "There are unsaved changes.";
		}
	};
	
  	socket.on('metadataChanged', function (data) {
		if (data.project !== undefined && data.resource !== undefined && data.metadata !== undefined && data.type === 'marker'
			&& filePath === data.project + "/" + data.resource) {
			
			var markers = [];
			for(i = 0; i < data.metadata.length; i++) {
				var lineOffset = editor.getModel().getLineStart(data.metadata[i].line - 1);
				
				console.log(lineOffset);
				
				markers[i] = {
					'description' : data.metadata[i].description,
					'line' : data.metadata[i].line,
					'severity' : data.metadata[i].severity,
					'start' : (data.metadata[i].start - lineOffset) + 1,
					'end' : data.metadata[i].end - lineOffset
				};
			}
			
			editor.showProblems(markers);
		}
  	});
	
  	socket.on('livemetadata', function (data) {
		if (data.resource !== undefined && data.problems !== undefined && filePath === data.resource) {
			var markers = [];
			for(i = 0; i < data.problems.length; i++) {
				var lineOffset = editor.getModel().getLineStart(data.problems[i].line - 1);
				
				console.log(lineOffset);
				
				markers[i] = {
					'description' : data.problems[i].description,
					'line' : data.problems[i].line,
					'severity' : data.problems[i].severity,
					'start' : (data.problems[i].start - lineOffset) + 1,
					'end' : data.problems[i].end - lineOffset
				};
			}
			
			editor.showProblems(markers);
		}
    	console.log(data);
  	});
	
	var xhr = new XMLHttpRequest();

	var filePath = window.location.href.split('#')[1];
	var project = undefined;
	var resource = undefined;
	
	var lastSavePointContent = '';
	var lastSavePointHash = 0;
	var lastSavePointTimestamp = 0;
	
	if (filePath !== undefined) {
		project = filePath.split('/', 2)[0];
		resource = filePath.slice(project.length + 1);
		
		socket.emit('getResourceRequest', {
			'callback_id' : 0,
			'project' : project,
			'resource' : resource
		});
	}
	
	socket.on('getResourceResponse', function(data) {
		var text = data.content;
		
		editor.setInput("HomeController.java", null, text);
		javaContentAssistProvider.setResourcePath(filePath);
		
		lastSavePointContent = text;
		lastSavePointHash = CryptoJS.SHA1(text);
		lastSavePointTime = data.timestamp;

		socket.emit('startedediting', {'resource' : filePath})
		
		editor.getTextView().addEventListener("ModelChanged", function(evt) {
//			console.log(evt);
			
			var changeData = {
							'resource' : filePath,
							'start' : evt.start,
							'addedCharCount' : evt.addedCharCount,
							'addedLineCount' : evt.addedLineCount,
							'removedCharCount' : evt.removedCharCount,
							'removedLineCount' : evt.removedLineCount
							};
							
			if (evt.addedCharCount > 0) {
				var addedText = editor.getModel().getText(evt.start, evt.start + evt.addedCharCount);
				changeData.addedCharacters = addedText;
			}
			
			socket.emit('modelchanged', changeData);
		});
		
	});
	
	socket.on('getResourceRequest', function(data) {
		if (data.project == project && data.resource == resource && data.callback_id !== undefined) {
			
			if ((data.hash === undefined || data.hash === lastSavePointHash)
				&& data.timestamp === undefined || data.timestamp === lastSavePointTimestamp) {

				socket.emit('getResourceResponse', {
					'callback_id' 		: data.callback_id,
					'requestSenderID' 	: data.requestSenderID,
					'project' 			: project,
					'resource' 			: resource,
					'timestamp' 		: lastSavePointTimestamp,
					'hash' 				: lastSavePointHash,
					'content' 			: lastSavePointContent
				});
			}

		}
	});
	
	function save(editor) {
		setTimeout(function() {
			lastSavePointContent = editor.getText();
			
			var hash = CryptoJS.SHA1(lastSavePointContent);
			lastSavePointHash = hash.toString(CryptoJS.enc.Hex);
			lastSavePointTimestamp = Date.now();
			
			socket.emit('resourceChanged', {
				'project' : project,
				'resource' : resource,
				'timestamp' : lastSavePointTimestamp,
				'hash' : lastSavePointHash
			});
			
			/*
			xhr.open("PUT", "/api/" + filePath, true);
			xhr.onreadystatechange = function() {
				if (xhr.readyState == 4) {
			        if (xhr.status==200) {
						var response = xhr.responseText;
			        } else {
						window.alert("Error during save.");
			        }
			    }
			}
			xhr.send(editor.getText()); */
		}, 0);
	}

		
/*
		xhr.open("GET", "/api/" + filePath, true);
		xhr.onreadystatechange = function() {
			if (xhr.readyState == 4) {
		        if (xhr.status==200) {
					var response = xhr.responseText;
					editor.setInput("HomeController.java", null, response);
					
					javaContentAssistProvider.setResourcePath(filePath);
					
					socket.emit('startedediting', {'resource' : filePath})
					
					editor.getTextView().addEventListener("ModelChanged", function(evt) {
						console.log(evt);
						
						var changeData = {
										'resource' : filePath,
										'start' : evt.start,
										'addedCharCount' : evt.addedCharCount,
										'addedLineCount' : evt.addedLineCount,
										'removedCharCount' : evt.removedCharCount,
										'removedLineCount' : evt.removedLineCount
										};
										
						if (evt.addedCharCount > 0) {
							var addedText = editor.getModel().getText(evt.start, evt.start + evt.addedCharCount);
							changeData.addedCharacters = addedText;
						}
						
						socket.emit('modelchanged', changeData);
					});
		        } else {
					editor.setInput("Error", null, xhr.status);
		        }
		    }
		}
		xhr.send();
	}
*/
});
