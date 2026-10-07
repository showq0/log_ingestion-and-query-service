
<outcome>
# test each endpoint  endpoint: 
create a script to do all the 6 stpes to automate testing api endpoints 
three scripts inside main script 
</outcome>

<script1>
##  script1 
    has access to the project and give you open api spesification yml file
    1- give it core logic repo 
    2- ask for open api yml file and specify the version of open api (choose the latest)
</script1>

<script2>
## script2
    second script do this steps and take the open api spesification yml file as an input
    1- based on open opi yml create senrios as a list of payloads.
    2- create list of expected response for each scenarios. 
    3- create bruno as yml file or json based for each scenario. 
</script2>

<script3>
## script3 
    thired script take bruno yml file as an input 
    1- automate bruno tests and campare the actual response with expected response(point4)
</script3>



// notes 
// get open api specefication from code (agent) -> yml as outcome
// ask an agent to verify and test yml is valid (valid or not ) the agent has to fix it 
// based on yml file (i want to create all possible (give an exapmles)[senarios])
// look at payload and responce (mention a file) for the data structure for the valid payload and expected response
// test in bruno as yml file or json
// try to adabt them
