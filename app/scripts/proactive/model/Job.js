define(
    [
        'backbone',
        'proactive/model/SchemaModel',
        'proactive/model/Task',
        'proactive/model/ScriptExecutable',
        'proactive/model/NativeExecutable',
        'proactive/model/JavaExecutable',
        'proactive/model/BranchWithScript',
        'proactive/model/utils',
        'proactive/view/utils/undo', // TODO remove
        'proactive/config',
        'proactive/rest/studio-client'
    ],

    // TODO REMOVE undoManager dependency - comes from view
    function (Backbone, SchemaModel, Task, ScriptExecutable, NativeExecutable, JavaExecutable, BranchWithScript, Utils, undoManager, config, StudioClient) {

    "use strict";

	var bigCrossTemplate = _.template('<div><span data-editor></span><button type="button" class="delete-button" data-action="remove">X</button></div>', 
    		null, Backbone.Form.templateSettings);

    return SchemaModel.extend({
        schema: {
            "Name": {type: "Text", fieldAttrs: {"data-tab": 'General Parameters', 'data-tab-help': 'General workflow parameters (name, description, priority...)', 'placeholder': '@attributes->name', "data-help":'The name of your workflow.'}},
            "Project": {type: "Text", fieldAttrs: {'placeholder': '@attributes->projectName', "data-help":'Set a name of a project to be able to group different jobs of the same project later.'}},
            "Description": {type: "Text", fieldAttrs: {'placeholder': ['description->#cdata-section', 'description->#text'], "data-help": "Small textual explanation of what this job does."}},
            "Job Priority": {type: 'Select', fieldAttrs: {'placeholder': '@attributes->priority', "data-help":"Scheduling priority level of the job. A user can only set the priority of his jobs and can only use the values \"lowest\", \"low\", or \"normal\". There are two higher priority levels \"high\" and \"highest\" which can be only set by the administrator."}, options: ["low", "normal", { val: "high", label: 'high (admin only)' }, { val: "highest", label: 'highest (admin only)' }]},
            "Variables": {type: 'List', itemType: 'Object', fieldAttrs: {"data-tab": "Workflow Variables", 'placeholder': 'variables->variable', "data-tab-help":"Workflow variables that will be available in all tasks.",
            	"data-help":"<li><b>Name</b>: Name of the variable</li><li><b>Value</b>: Value of the variable</li>"}, 
            	itemToString: Utils.inlineNameValue, itemTemplate: bigCrossTemplate,  subSchema: {
                "Name": { validators: ['required'], fieldAttrs: {'placeholder': '@attributes->name'}, type: 'Text', editorClass: 'popup-input-text-field'  },
                "Value": { fieldAttrs: {'placeholder': '@attributes->value'}, type: 'Text', editorClass: 'popup-input-text-field'  },
                "Model": { fieldAttrs: {'placeholder': '@attributes->model'}, title: '<br>Model or Data Type (PA:Integer, PA:Boolean, ...)<br>see <a target="_blank" href="' + config.docUrl +'/user/ProActiveUserGuide.html#_variable_model">documentation</a>.', type: 'Text', editorClass: 'popup-input-text-field' }
            }},
            "Generic Info": {type: 'List', itemType: 'Object', fieldAttrs: {"data-tab": "Generic Info", 'placeholder': 'genericInformation->info', "data-help":"Some extra information about your job often used to change the scheduling behavior for a job. E.g. NODE_ACCESS_TOKEN=rack1 will assign this job to a node with token \"rack1\"."}, 
            	itemToString: Utils.inlineNameValue, itemTemplate: bigCrossTemplate, subSchema: {
                "Property Name": { validators: ['required'], fieldAttrs: {'placeholder': '@attributes->name'} },
                "Property Value": { validators: ['required'], fieldAttrs: {'placeholder': '@attributes->value'} }
            }},
            "User Space Url": {type: "Text", fieldAttrs: {"data-tab": "Data Management", 'data-tab-help': 'DataSpaces allow to automatically manage File transfer at the level of Job and Tasks.', 'placeholder': 'userSpace->@attributes->url', "data-help":"A User Space which is a personal user data storage. Usually you set this url if you want to use your own dataspace server, not the one that is included into the Scheduler."}},
            "Global Space Url": {type: "Text", fieldAttrs: {'placeholder': 'globalSpace->@attributes->url', "data-help":"A Global Space where anyone can read/write files. Usually you set this url if you want to use your own dataspace server, not the one that is included into the Scheduler."}},
            "Input Space Url": {type: "Text", fieldAttrs: {'placeholder': 'inputSpace->@attributes->url', "data-help":"A private read-only Data Space started manually by user with the proactive-dataserver command."}},
            "Output Space Url": {type: "Text", fieldAttrs: {'placeholder': 'outputSpace->@attributes->url', "data-help":"A private Data Space started manually by user with the proactive-dataserver command."}},
            "Maximum Number of Execution Attempts": {type: 'Number', fieldAttrs: {"data-tab": "Error Handling", 'data-tab-help': 'Configure workflow behavior upon errors', 'placeholder': '@attributes->maxNumberOfExecution', "data-help":"Defines the maximum number of execution attempts for the tasks."}},
            "On Task Error Policy": {type: 'Select', fieldAttrs: {'placeholder': '@attributes->onTaskError', "data-help":"Actions to take if an error occurs in a task. Setting this property in the job defines the behavior for every task. Each task can overwrite this behavior.<br><br>The actions that are available at the Job level are:<br>&nbsp;&nbsp;- cancel job after all execution attempts<br>&nbsp;&nbsp;- continue job (try all execution attempts)<br>&nbsp;&nbsp;- suspend task after first error and continue others<br>&nbsp;&nbsp;- suspend task after first error and pause job immediately."}, options: [
                {val: "cancelJob", label: "cancel job after all execution attempts"},
                {val: "suspendTask", label: "suspend task after first error and continue others"},
                {val: "pauseJob", label: "suspend task after first error and pause job immediately"},
                {val: "continueJobExecution", label: "continue job (try all execution attempts)"}
            ]},
            "If An Error Occurs Restart Task": {type: 'Select', fieldAttrs: {'placeholder': '@attributes->restartTaskOnError', "data-help":"Defines whether tasks that have to be restarted will restart on an other computing node."}, options: ["anywhere", "elsewhere"]}
        },
        initialize: function () {
            this.set({"Name": "Untitled Workflow 1"});
            this.set({"Job Priority": "normal"});
            this.set({"On Task Error Policy": "continueJobExecution"});
            this.set({"Maximum Number of Execution Attempts": 2});
            this.set({"If An Error Occurs Restart Task": "anywhere"});

            var that = this;
            this.schema.Variables.subSchema.Model.validators = [
                function checkVariableValue(value, formValues) {
                    if (formValues.Model.length > 0) {
                        var StudioApp = require('StudioApp');
                        if (StudioApp.isWorkflowOpen()) {
                            that.updateVariable(formValues);
                            var validationData = StudioClient.validate(StudioApp.views.xmlView.generateXml(), StudioApp.models.jobModel);
                            if (!validationData.valid) {
                                var err = {
                                    type: 'Validation',
                                    message: "<br><br>" + validationData.errorMessage
                                };
                                return err;
                            }
                        }
                    }
                }
            ]

            this.tasks = [];
            this.on("change", function (eventName, event) {
                undoManager.save()
            });

        },
        updateVariable: function (variable) {
            if (!variable.hasOwnProperty('Value') || !variable.Value) {
                variable.Value = "";
            }
            if (this.attributes.hasOwnProperty('Variables')) {
                var variables = this.attributes.Variables;
                var index = -1
                for (var i = 0; i < variables.length; i++) {
                    if (variables[i].Name == variable.Name) {
                        index = i;
                    }
                }
                if (index == -1) {
                    this.attributes.Variables.push(variable)
                } else {
                    this.attributes.Variables[index] = variable
                }
            } else {
                this.attributes.Variables = [variable];
            }
        },
        addTask: function (task) {
            console.log("Adding task", task)
            this.tasks.push(task)
        },
        removeTask: function (task) {
            console.log("Removing task", task)
            var index = this.tasks.indexOf(task)
            if (index != -1) this.tasks.splice(index, 1)
            $.each(this.tasks, function (i, t) {
                t.removeControlFlow(task);
            })
        },
        getDependantTask: function (taskName) {
            for (var i in this.tasks) {
                var task = this.tasks[i];
                if (task.dependencies) {
                    for (var j in task.dependencies) {
                        var dep = task.dependencies[j];
                        if (taskName == dep.get('Task Name')) {
                            return task.get('Task Name');
                        }
                    }
                }
            }

            return;
        },
        getTaskByName: function (taskName) {
            for (var i in this.tasks) {
                var task = this.tasks[i];
                if (taskName == task.get('Task Name')) {
                    return task;
                }
            }
        },
        getTasksCount: function () {
        	return this.tasks.length;
        },
        updateWorkflowName: function (job) {
            this.set({"Name": job["@attributes"].name.trim()});
        },
        populate: function (obj, merging, isTemplate) {
            if(isTemplate){
                this.populateTemplate(obj, merging);
            }else{
                this.populateSchema(obj, merging);
            }
            this.convertCancelJobOnErrorToOnTaskError(obj);
            var that = this;
            if (obj.taskFlow && obj.taskFlow.task) {

                if (!Array.isArray(obj.taskFlow.task)) {
                    obj.taskFlow.task = [obj.taskFlow.task];
                }
                var name2Task = {};
                $.each(obj.taskFlow.task, function (i, task) {
                    var taskModel = new Task();
                    if (task.javaExecutable) {
                        taskModel.schema['Execute']['model'] = JavaExecutable;
                        taskModel.schema['Execute']['fieldAttrs'] = {placeholder: 'javaExecutable'}
                        taskModel.set({'Execute': new JavaExecutable()});
                        taskModel.set({Type: "JavaExecutable"});
                    } else if (task.nativeExecutable) {
                        taskModel.schema['Execute']['model'] = NativeExecutable;
                        taskModel.schema['Execute']['fieldAttrs'] = {placeholder: 'nativeExecutable'}
                        taskModel.set({'Execute': new NativeExecutable()});
                        taskModel.set({Type: "NativeExecutable"});
                    } else if (task.scriptExecutable) {
                        taskModel.schema['Execute']['model'] = ScriptExecutable;
                        taskModel.schema['Execute']['fieldAttrs'] = {placeholder: 'scriptExecutable'}
                        taskModel.set({'Execute': new ScriptExecutable()});
                        taskModel.set({Type: "ScriptExecutable"});
                    }
                    taskModel.convertCancelJobOnErrorToOnTaskError(task);
                    taskModel.populateSchema(task);
                    taskModel.populateSimpleForm();

                    // check for unique task name to keep the job valid
                    var originalName = taskModel.get("Task Name");
                    if (merging && that.getTaskByName(taskModel.get("Task Name"))) {
                        var counter = 2;
                        while (that.getTaskByName(taskModel.get("Task Name") + counter)) {
                            counter++;
                        }
                        taskModel.set({"Task Name": originalName + counter});
                    }
                    console.log("Adding task to workflow", taskModel)
                    that.tasks.push(taskModel);
                    name2Task[taskModel.get("Task Name")] = taskModel;
                    name2Task[originalName] = taskModel;
                });
                // adding dependencies after all tasks are populated
                $.each(obj.taskFlow.task, function (i, task) {
                    var taskModel = name2Task[task['@attributes']['name']]
                    if (taskModel && task.depends && task.depends.task) {
                        if (!Array.isArray(task.depends.task)) {
                            task.depends.task = [task.depends.task];
                        }
                        $.each(task.depends.task, function (i, dep) {
                            if (name2Task[dep['@attributes']['ref']]) {
                                var depTaskModel = name2Task[dep['@attributes']['ref']];
                                taskModel.addDependency(depTaskModel);
                            }
                        })
                    }
                })
                // adding controlFlows after all dependencies are set
                $.each(obj.taskFlow.task, function (i, taskJson) {
                    var taskModel = name2Task[taskJson['@attributes']['name']]
                    if (taskJson.controlFlow) {
                        if (taskJson.controlFlow.if) {
                            var ifFlow = taskJson.controlFlow.if['@attributes'];
                            taskModel.setif(name2Task[ifFlow['target']])
                            taskModel.controlFlow.if.model.populateSchema(taskJson.controlFlow.if);
                            taskModel.setelse(name2Task[ifFlow['else']])
                            taskModel.setcontinuation(name2Task[ifFlow['continuation']])
                        }
                        if (taskJson.controlFlow.replicate) {
                            taskModel.setreplicate();
                            taskModel.controlFlow.replicate.model.populateSchema(taskJson.controlFlow.replicate);
                        }
                        if (taskJson.controlFlow.loop) {
                            var branch = new BranchWithScript();
                            branch.populateSchema(taskJson.controlFlow.loop);
                            var loopTarget = taskJson.controlFlow.loop['@attributes']['target'];
                            var targetTask = name2Task[loopTarget];
                            taskModel.set({'Control Flow': 'loop'});
                            taskModel.controlFlow = {'loop': {task: targetTask, model: branch}};
                        }
                    }
                })
            }
        },
        getBasicFields: function() {
            return ["Name", "Variables"]
        }
    })
})
